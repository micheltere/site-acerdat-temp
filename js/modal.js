// Espera o site carregar completamente
document.addEventListener('DOMContentLoaded', function() {
    
    // Pega os elementos necessários
    const modalOverlay = document.getElementById('modal-gt');
    const modalTitulo = document.getElementById('modal-titulo-placeholder');
    const modalCorpo = document.getElementById('modal-corpo-placeholder');
    const closeBtn = document.querySelector('.close-modal');
    const acionadores = document.querySelectorAll('.acionador-modal');

    // Função para abrir o modal
    function abrirModal(titulo, conteudoHtml) {
        modalTitulo.textContent = titulo;
        modalCorpo.innerHTML = conteudoHtml; // Usa innerHTML para interpretar as tags <p> e <ul>
        modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // Impede a rolagem da página de fundo
    }

    // Função para fechar o modal
    function fecharModal() {
        modalOverlay.classList.remove('active');
        document.body.style.overflow = 'auto'; // Libera a rolagem da página
    }

    // Adiciona o evento de clique em cada card de GT
    acionadores.forEach(card => {
        card.addEventListener('click', function() {
            // Pega os dados escondidos nos atributos 'data-' do card clicado
            const titulo = this.getAttribute('data-titulo');
            const conteudo = this.getAttribute('data-conteudo');
            abrirModal(titulo, conteudo);
        });
    });

    // Fecha ao clicar no X
    closeBtn.addEventListener('click', fecharModal);

    // Fecha ao clicar no fundo escuro (fora da caixa branca)
    modalOverlay.addEventListener('click', function(event) {
        if (event.target === modalOverlay) {
            fecharModal();
        }
    });

    // Fecha ao apertar a tecla ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modalOverlay.classList.contains('active')) {
            fecharModal();
        }
    });
});