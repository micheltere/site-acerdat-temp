from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import feedparser
import json

# Configuração das Fontes
fontes = [
    # 0: ONU (RSS Bom)
    { "id": 0, "nome": "ONU News", "url": "https://news.un.org/feed/subscribe/pt/news/all/rss.xml", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png" },
    # 1: DW (RSS Difícil - Python resolve)
    { "id": 1, "nome": "DW Brasil", "url": "https://rss.dw.com/xml/rss-br-news", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png" },
    # 2: RFI (RSS Difícil - Python resolve)
    { "id": 2, "nome": "RFI", "url": "https://www.rfi.fr/br/geral/rss", "logo": "https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png" },
    # 3: Agência Brasil
    { "id": 3, "nome": "Agência Brasil", "url": "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", "logo": "https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png" },
    # 4: Senado
    { "id": 4, "nome": "Senado", "url": "https://www12.senado.leg.br/noticias/feed/todas-as-noticias/rss", "logo": "https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png" },
    # 5: Câmara
    { "id": 5, "nome": "Câmara", "url": "https://www.camara.leg.br/noticias/rss/ultimas-noticias", "logo": "https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png" }
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 1. Configura Headers (CORS e JSON)
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        # 2. Pega o ID da URL (ex: ?id=1)
        query = urlparse(self.path).query
        params = parse_qs(query)
        
        # Se não mandou ID, retorna erro
        if 'id' not in params:
            self.wfile.write(json.dumps([]).encode('utf-8'))
            return

        id_fonte = int(params['id'][0])
        
        # Validação simples
        if id_fonte < 0 or id_fonte >= len(fontes):
            self.wfile.write(json.dumps([]).encode('utf-8'))
            return

        fonte = fontes[id_fonte]
        noticias_formatadas = []

        try:
            # 3. O PULO DO GATO: Feedparser do Python
            # Ele baixa e processa automaticamente, lidando com erros de formato
            feed = feedparser.parse(fonte['url'])

            # Pega as 4 primeiras
            for entry in feed.entries[:4]:
                imagem_final = None

                # Tenta achar imagem de todas as formas que o feedparser conhece
                # Media Content (DW usa isso)
                if 'media_content' in entry:
                    imagem_final = entry.media_content[0]['url']
                # Media Thumbnail (RFI usa isso)
                elif 'media_thumbnail' in entry:
                    imagem_final = entry.media_thumbnail[0]['url']
                # Enclosure (ONU usa isso)
                elif hasattr(entry, 'enclosures') and len(entry.enclosures) > 0:
                     imagem_final = entry.enclosures[0].href
                # Links gerais
                elif 'links' in entry:
                    for link in entry.links:
                        if 'image' in link.type:
                            imagem_final = link.href
                            break
                
                # Se não achou imagem, usa o logo
                if not imagem_final:
                    imagem_final = fonte['logo']

                noticias_formatadas.append({
                    "titulo": entry.title,
                    "link": entry.link,
                    "imagem": imagem_final,
                    "fonte": fonte['nome'],
                    # Tenta pegar data, se não tiver usa string vazia
                    "data": entry.published if hasattr(entry, 'published') else ""
                })

            # Retorna o JSON
            self.wfile.write(json.dumps(noticias_formatadas).encode('utf-8'))

        except Exception as e:
            # Se der erro, retorna lista vazia para não travar o site
            print(f"Erro Python: {str(e)}")
            self.wfile.write(json.dumps([]).encode('utf-8'))