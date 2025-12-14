const trilho = document.getElementById('container-noticias');
const btnVoltar = document.getElementById('btn-voltar');
const btnAvancar = document.getElementById('btn-avancar');
let autoPlayInterval;

async function carregarNoticias() {
    trilho.innerHTML = '<p style="padding:20px;">Carregando notícias em tempo real...</p>';

    try {
        // Chamamos a NOSSA API em vez de serviços de terceiros
        // Nota: Isso só vai funcionar 100% depois que subir para a Vercel
        const res = await fetch('/api/noticias'); 
        const noticias = await res.json();

        if (noticias.length > 0) {
            renderizarCarrossel(noticias);
        } else {
            throw new Error("Nenhuma notícia encontrada");
        }
    } catch (erro) {
        console.error("Erro:", erro);
        // Se der erro (ex: rodando localmente sem a API), usa dados de teste ou aviso
        trilho.innerHTML = '<p>Conecte o projeto na Vercel para ver a API funcionando.</p>';
    }
}

function renderizarCarrossel(lista) {
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

    ativarCarrosselInfinito();
}

// ... (Mantenha a função ativarCarrosselInfinito igual à anterior) ...
function ativarCarrosselInfinito() {
    if (trilho.children.length === 0) return;
    const larguraItem = trilho.children[0].offsetWidth + 20; 

    function moverProximo() {
        trilho.style.transition = 'transform 0.5s ease';
        trilho.style.transform = `translateX(-${larguraItem}px)`;
        setTimeout(() => {
            trilho.style.transition = 'none';
            trilho.appendChild(trilho.firstElementChild);
            trilho.style.transform = 'translateX(0)';
        }, 500);
    }
    // ... adicione o resto da lógica de botões e timer aqui (igual ao anterior) ...
    if(btnAvancar) { btnAvancar.onclick = () => { moverProximo(); resetarTimer(); }; }
    function iniciarTimer() { autoPlayInterval = setInterval(moverProximo, 4000); }
    function resetarTimer() { clearInterval(autoPlayInterval); iniciarTimer(); }
    iniciarTimer();
}

carregarNoticias();