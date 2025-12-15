from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import feedparser
import json
import requests
from bs4 import BeautifulSoup

# Configuração das Fontes
fontes = [
    # 0: ONU (RSS Bom)
    { "id": 0, "nome": "ONU News", "url": "https://news.un.org/feed/subscribe/pt/news/all/rss.xml", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png", "raspar": False },
    # 1: DW (Precisa de Header)
    { "id": 1, "nome": "DW Brasil", "url": "https://rss.dw.com/xml/rss-br-news", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png", "raspar": False },
    # 2: RFI (Precisa de Header)
    { "id": 2, "nome": "RFI", "url": "https://www.rfi.fr/br/geral/rss", "logo": "https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png", "raspar": False },
    # 3: Agência Brasil (PRECISA DE RASPAGEM)
    { "id": 3, "nome": "Agência Brasil", "url": "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", "logo": "https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png", "raspar": True },
    # 4: Senado (PRECISA DE RASPAGEM)
    { "id": 4, "nome": "Senado", "url": "https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss", "logo": "https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png", "raspar": True },
    # 5: Câmara (PRECISA DE RASPAGEM)
    { "id": 5, "nome": "Câmara", "url": "https://www.camara.leg.br/noticias/rss/ultimas-noticias", "logo": "https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png", "raspar": True }
]

# Função para raspar a imagem real do site (BeautifulSoup)
def pegar_imagem_real(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        resp = requests.get(url, headers=headers, timeout=3)
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        # Procura og:image
        meta_img = soup.find('meta', property='og:image')
        if meta_img and meta_img.get('content'):
            return meta_img['content']
            
        # Procura twitter:image
        meta_tw = soup.find('meta', attrs={'name': 'twitter:image'})
        if meta_tw and meta_tw.get('content'):
            return meta_tw['content']
            
        return None
    except:
        return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            
            if 'id' not in params:
                self.wfile.write(json.dumps([]).encode('utf-8'))
                return

            id_fonte = int(params['id'][0])
            fonte = fontes[id_fonte]
            noticias_formatadas = []

            # Headers para enganar bloqueios (DW/RFI)
            headers_rss = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }

            # 1. Baixa o RSS manualmente com Requests (para passar o User-Agent)
            resp = requests.get(fonte['url'], headers=headers_rss, timeout=5)
            # 2. Passa o conteúdo para o Feedparser
            feed = feedparser.parse(resp.content)

            for entry in feed.entries[:3]: # Top 3 notícias
                imagem_final = None

                # TENTATIVA 1: Buscar no RSS (Padrão)
                if 'media_content' in entry and len(entry.media_content) > 0:
                    imagem_final = entry.media_content[0]['url']
                elif 'media_thumbnail' in entry and len(entry.media_thumbnail) > 0:
                    imagem_final = entry.media_thumbnail[0]['url']
                elif hasattr(entry, 'enclosures') and len(entry.enclosures) > 0:
                     imagem_final = entry.enclosures[0].href
                elif 'links' in entry:
                    for link in entry.links:
                        if 'image' in link.type:
                            imagem_final = link.href
                            break

                # TENTATIVA 2: Se a imagem for ruim ou a fonte exigir raspagem -> BeautifulSoup
                if fonte['raspar'] or not imagem_final:
                    # Só ativa o raspador se a imagem não existir ou parecer placeholder
                    if not imagem_final or "placeholder" in imagem_final or "ebc.png" in imagem_final:
                        img_real = pegar_imagem_real(entry.link)
                        if img_real:
                            imagem_final = img_real

                # TENTATIVA 3: Fallback para o Logo (Garantia para não ficar preto/vazio)
                if not imagem_final:
                    imagem_final = fonte['logo']

                noticias_formatadas.append({
                    "titulo": entry.title,
                    "link": entry.link,
                    "imagem": imagem_final,
                    "fonte": fonte['nome'],
                    "data": entry.published if hasattr(entry, 'published') else ""
                })

            self.wfile.write(json.dumps(noticias_formatadas).encode('utf-8'))

        except Exception as e:
            # Em caso de erro, retorna lista vazia
            print(f"Erro: {str(e)}")
            self.wfile.write(json.dumps([]).encode('utf-8'))