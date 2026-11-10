// Aplica o tema salvo antes de a tela aparecer (evita piscar no tema errado).
// O padrão é o modo claro; o escuro só vale se a pessoa escolheu.
// Fica num arquivo separado (e não dentro do index.html) para a regra de
// segurança do site (Content-Security-Policy) poder bloquear scripts embutidos.
try {
  if (localStorage.getItem("arc-theme") === "dark") {
    delete document.documentElement.dataset.theme;
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute("content", "#05080f");
  }
} catch (e) {
  // Sem acesso ao armazenamento: fica no tema claro
}
