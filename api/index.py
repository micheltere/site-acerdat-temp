from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import feedparser
import json
import requests
import re
from bs4 import BeautifulSoup

# Configuração das Fontes
fontes = [
    # 0: ONU (RSS - OK)
    { "id": 0, "nome": "ONU News", "url": "https://news.un.org/feed/subscribe/pt/news/all/rss.xml", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Flag_of_the_United_Nations.svg/1200px-Flag_of_the_United_Nations.svg.png", "raspar": False },
    
    # 1: DW Brasil (RDF/RSS - OK)
    { "id": 1, "nome": "DW Brasil", "url": "https://rss.dw.com/xml/rss-br-all", "logo": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Deutsche_Welle_logo.svg/1024px-Deutsche_Welle_logo.svg.png", "raspar": False },
    
    # 2: RFI (RSS - OK)
    { "id": 2, "nome": "RFI", "url": "https://www.rfi.fr/br/geral/rss", "logo": "https://s.rfi.fr/media/display/f605a60e-6f81-11e9-9a6b-005056a99247/rfi-share-fb-tw-default_0.png", "raspar": True },
    
    # 3: Agência Brasil (RSS - OK)
    { "id": 3, "nome": "Agência Brasil", "url": "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", "logo": "https://agenciabrasil.ebc.com.br/sites/default/files/logo-ebc-agencia-brasil.png", "raspar": True },
    
    # 4: Senado (ATOM - LINK CORRIGIDO)
    # Usando o link puro Atom e tratamento específico na busca de imagem
    { "id": 4, "nome": "Senado", "url": "https://www12.senado.leg.br/noticias/feed/todasnoticias", "logo": "https://www12.senado.leg.br/noticias/++theme++senado.portal.theme/img/senado-federal-share.png", "raspar": True },
    
    # 5: Câmara (RSS - OK)
    { "id": 5, "nome": "Câmara", "url": "https://www.camara.leg.br/noticias/rss/ultimas-noticias", "logo": "https://www.camara.leg.br/midias/image/2023/04/marca-camara-200-anos-verde-horizontal.png", "raspar": True }
]

def extrair_img_do_html_atom(html_content):
    if not html_content: return None
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        img = soup.find('img')
        if img and img.get('src'):
            return img['src']
    except:
        return None
    return None

def cacar_imagem_na_forca_bruta(entry):
    # 1. Tenta campos padronizados (RSS/Atom)
    if hasattr(entry, 'media_content') and len(entry.media_content) > 0:
        return entry.media_content[0]['url']
    if hasattr(entry, 'media_thumbnail') and len(entry.media_thumbnail) > 0:
        return entry.media_thumbnail[0]['url']
    if hasattr(entry, 'enclosures') and len(entry.enclosures) > 0:
        return entry.enclosures[0].href
    
    # 2. ESTRATÉGIA ATOM (Senado): Procura imagem dentro do 'summary' ou 'content'
    # O feedparser joga o conteúdo do Atom em 'summary' ou 'content'
    if hasattr(entry, 'summary'):
        img = extrair_img_do_html_atom(entry.summary)
        if img: return img
        
    if hasattr(entry, 'content') and len(entry.content) > 0:
        img = extrair_img_do_html_atom(entry.content[0].value)
        if img: return img

    # 3. Último recurso: Regex no texto bruto
    texto_bruto = str(entry)
    match = re.search(r'(https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp))', texto_bruto, re.IGNORECASE)
    if match:
        return match.group(1)
    return None

def pegar_imagem_real(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
        # Timeout curto para não travar
        resp = requests.get(url, headers=headers, timeout=3)
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        meta_img = soup.find('meta', property='og:image')
        if meta_img and meta_img.get('content'):
            return meta_img['content']
        return None
    except:
        return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        id_fonte = -1
        fonte_atual = None

        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            
            if 'id' not in params:
                self.wfile.write(json.dumps([]).encode('utf-8'))
                return

            id_fonte = int(params['id'][0])
            fonte_atual = fontes[id_fonte]
            noticias_formatadas = []

            # Headers Essenciais (Forçando XML/Atom para o Senado não mandar HTML)
            headers_rss = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/atom+xml,application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7'
            }

            # Baixa o feed
            resp = requests.get(fonte_atual['url'], headers=headers_rss, timeout=6)
            
            if resp.status_code != 200:
                raise Exception(f"HTTP {resp.status_code}")

            # Feedparser lida bem com encoding automaticamente
            feed = feedparser.parse(resp.content)

            if len(feed.entries) == 0:
                raise Exception("Feed vazio")

            for entry in feed.entries[:4]:
                try:
                    imagem_final = None
                    
                    # Tenta achar imagem leve (agora com suporte melhor a Atom)
                    imagem_final = cacar_imagem_na_forca_bruta(entry)

                    # Se falhar e a fonte permitir, faz raspagem
                    if fonte_atual['raspar']:
                        if not imagem_final or "placeholder" in str(imagem_final):
                            img_real = pegar_imagem_real(entry.link)
                            if img_real:
                                imagem_final = img_real

                    if not imagem_final:
                        imagem_final = fonte_atual['logo']

                    noticias_formatadas.append({
                        "titulo": entry.title,
                        "link": entry.link,
                        "imagem": imagem_final,
                        "fonte": fonte_atual['nome'],
                        "data": entry.published if hasattr(entry, 'published') else ""
                    })
                except:
                    continue

            self.wfile.write(json.dumps(noticias_formatadas).encode('utf-8'))

        except Exception as e:
            erro_card = [{
                "titulo": f"ERRO [{fonte_atual['nome'] if fonte_atual else id_fonte}]: {str(e)}",
                "link": "#",
                "imagem": fonte_atual['logo'] if fonte_atual else "https://via.placeholder.com/300/FF0000/FFFFFF?text=ERRO",
                "fonte": "SISTEMA",
                "data": ""
            }]
            self.wfile.write(json.dumps(erro_card).encode('utf-8'))