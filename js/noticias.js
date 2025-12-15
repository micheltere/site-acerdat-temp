const trilho = document.getElementById('container-noticias');
const btnVoltar = document.getElementById('btn-voltar');
const btnAvancar = document.getElementById('btn-avancar');
let autoPlayInterval;

// IDs das fontes (0 a 5 conforme configurado na API)
const fontesIds = [0, 1, 2, 3, 4, 5]; 
let todasAsNoticias = [];

async function carregarNoticias() {
    trilho.innerHTML = ''; // Limpa o trilho

    // Cria um array de promessas (pedidos para a API)
    const pedidos = fontesIds.map(async (id) => {
        try {
            // Chama a API pedindo SÓ aquela fonte (ex: api/noticias?id=3)
             // Chamando o arquivo index.py do Python
            const res = await fetch(`/api?id=${id}`);
            const noticias = await res.json();
            
            if (Array.isArray(noticias)) {
                // Adiciona as notícias que chegaram na lista geral
                todasAsNoticias.push(...noticias);
                
                // Ordena tudo por data a cada chegada (para manter as novas no topo)
                todasAsNoticias.sort((a, b) => new Date(b.data) - new Date(a.data));
                
                // Renderiza o que temos até agora (Efeito "Streaming")
                renderizarCarrossel(todasAsNoticias);
            }
        } catch (erro) {
            console.warn(`Erro ao carregar fonte ${id}`, erro);
        }
    });

    // Não usamos await aqui para não travar. 
    // O renderizarCarrossel será chamado várias vezes, atualizando a tela.
}

function renderizarCarrossel(lista) {
    // Salva a posição atual do scroll se já existir
    // (Opcional, mas ajuda a não "pular" se o usuário já estiver vendo)
    
    trilho.innerHTML = '';
    
    lista.forEach(noticia => {
        const card = document.createElement('a');
        card.className = 'news-card';
        card.href = noticia.link;
        card.target = '_blank';
        card.innerHTML = `
            <div class="news-image" style="background-image: url('${noticia.imagem}');"></div>
            <div class="news-content">
                <span class="news-source-badge">${noticia.fonte}</span>
                <h3>${noticia.titulo}</h3>
            </div>
        `;
        trilho.appendChild(card);
    });

    // Reinicia a lógica do carrossel para reconhecer os novos cards
    iniciarLogicaCarrossel();
}

// Lógica de movimento (separada para poder ser reiniciada)
function iniciarLogicaCarrossel() {
    // Limpa timer anterior para não acumular velocidade
    if (autoPlayInterval) clearInterval(autoPlayInterval);
    
    if (trilho.children.length === 0) return;
    
    const larguraItem = trilho.children[0].offsetWidth + 20; // card + gap

    function moverProximo() {
        trilho.style.transition = 'transform 0.5s ease';
        trilho.style.transform = `translateX(-${larguraItem}px)`;

        setTimeout(() => {
            trilho.style.transition = 'none';
            trilho.appendChild(trilho.firstElementChild);
            trilho.style.transform = 'translateX(0)';
        }, 500);
    }

    function moverAnterior() {
        trilho.style.transition = 'none';
        trilho.prepend(trilho.lastElementChild);
        trilho.style.transform = `translateX(-${larguraItem}px)`;

        setTimeout(() => {
            trilho.style.transition = 'transform 0.5s ease';
            trilho.style.transform = 'translateX(0)';
        }, 10);
    }

    // Remove event listeners antigos (cloneNode é um truque rápido para limpar eventos)
    if(btnAvancar) {
        const novoBtn = btnAvancar.cloneNode(true);
        btnAvancar.parentNode.replaceChild(novoBtn, btnAvancar);
        novoBtn.onclick = () => { moverProximo(); resetarTimer(); };
    }
    
    if(btnVoltar) {
        const novoBtnVoltar = btnVoltar.cloneNode(true);
        btnVoltar.parentNode.replaceChild(novoBtnVoltar, btnVoltar);
        novoBtnVoltar.onclick = () => { moverAnterior(); resetarTimer(); };
    }

    function iniciarTimer() {
        autoPlayInterval = setInterval(moverProximo, 4000);
    }

    function resetarTimer() {
        clearInterval(autoPlayInterval);
        iniciarTimer();
    }

    iniciarTimer();
}

carregarNoticias();