import {
  getCurrentUser,
  signIn,
  signUp,
  signOut,
  sendPasswordReset
} from "./auth.js";

const app = document.getElementById("app");

function showMessage(message, isError = false) {
  const el = document.getElementById("auth-message");

  if (!el) return;

  el.textContent = message;
  el.hidden = false;
  el.className = isError
    ? "auth-error"
    : "auth-success";
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-screen">
      <div class="auth-card">
        <div class="brand" style="padding:0 0 22px;">
          <span class="brand-mark">R</span>
          <div class="brand-text">
            <strong style="color:var(--ink)">Razão</strong>
            <small>gestão financeira</small>
          </div>
        </div>

        <h2>Entrar</h2>
        <p class="modal-sub">
          Acesse seus dados financeiros em qualquer dispositivo.
        </p>

        <form id="login-form">
          <div class="field full">
            <label>E-mail</label>
            <input
              type="email"
              id="login-email"
              required
              autocomplete="email"
            >
          </div>

          <div class="field full" style="margin-top:12px;">
            <label>Senha</label>
            <input
              type="password"
              id="login-password"
              required
              autocomplete="current-password"
            >
          </div>

          <div id="auth-message" hidden></div>

          <div class="form-actions">
            <button type="submit" class="btn">
              Entrar
            </button>
          </div>
        </form>

        <p class="auth-switch">
          Não possui conta?
          <button
            type="button"
            class="link-btn"
            id="show-register"
          >
            Criar conta
          </button>
        </p>

        <p class="auth-switch">
          <button
            type="button"
            class="link-btn"
            id="show-reset"
          >
            Esqueci minha senha
          </button>
        </p>
      </div>
    </section>
  `;

  document
    .getElementById("login-form")
    .addEventListener("submit", handleLogin);

  document
    .getElementById("show-register")
    .addEventListener("click", renderRegister);

  document
    .getElementById("show-reset")
    .addEventListener("click", renderReset);
}

function renderRegister() {
  app.innerHTML = `
    <section class="auth-screen">
      <div class="auth-card">
        <h2>Criar conta</h2>

        <form id="register-form">
          <div class="field full">
            <label>Nome</label>
            <input
              type="text"
              id="register-name"
              required
              autocomplete="name"
            >
          </div>

          <div class="field full" style="margin-top:12px;">
            <label>E-mail</label>
            <input
              type="email"
              id="register-email"
              required
              autocomplete="email"
            >
          </div>

          <div class="field full" style="margin-top:12px;">
            <label>Senha</label>
            <input
              type="password"
              id="register-password"
              minlength="6"
              required
              autocomplete="new-password"
            >
          </div>

          <div id="auth-message" hidden></div>

          <div class="form-actions">
            <button type="button" class="btn secondary" id="back-login">
              Voltar
            </button>

            <button type="submit" class="btn">
              Criar conta
            </button>
          </div>
        </form>
      </div>
    </section>
  `;

  document
    .getElementById("register-form")
    .addEventListener("submit", handleRegister);

  document
    .getElementById("back-login")
    .addEventListener("click", renderLogin);
}

function renderReset() {
  app.innerHTML = `
    <section class="auth-screen">
      <div class="auth-card">
        <h2>Recuperar senha</h2>

        <form id="reset-form">
          <div class="field full">
            <label>E-mail</label>
            <input
              type="email"
              id="reset-email"
              required
              autocomplete="email"
            >
          </div>

          <div id="auth-message" hidden></div>

          <div class="form-actions">
            <button type="button" class="btn secondary" id="back-login">
              Voltar
            </button>

            <button type="submit" class="btn">
              Enviar recuperação
            </button>
          </div>
        </form>
      </div>
    </section>
  `;

  document
    .getElementById("reset-form")
    .addEventListener("submit", handleReset);

  document
    .getElementById("back-login")
    .addEventListener("click", renderLogin);
}

async function handleLogin(event) {
  event.preventDefault();

  const email =
    document.getElementById("login-email").value.trim();

  const password =
    document.getElementById("login-password").value;

  try {
    await signIn(email, password);
    window.location.reload();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const fullName =
    document.getElementById("register-name").value.trim();

  const email =
    document.getElementById("register-email").value.trim();

  const password =
    document.getElementById("register-password").value;

  try {
    await signUp(email, password, fullName);

    showMessage(
      "Conta criada. Verifique seu e-mail para confirmar o cadastro."
    );
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function handleReset(event) {
  event.preventDefault();

  const email =
    document.getElementById("reset-email").value.trim();

  try {
    await sendPasswordReset(email);

    showMessage(
      "Enviamos as instruções de recuperação para o seu e-mail."
    );
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderTemporaryDashboard(user) {
  app.innerHTML = `
    <section class="auth-screen">
      <div class="auth-card">
        <h2>Conexão concluída</h2>

        <p>
          Usuário autenticado:
        </p>

        <p class="mono">
          ${user.email}
        </p>

        <div class="form-actions">
          <button type="button" class="btn danger" id="logout-button">
            Sair
          </button>
        </div>
      </div>
    </section>
  `;

  document
    .getElementById("logout-button")
    .addEventListener("click", async () => {
      await signOut();
      renderLogin();
    });
}

async function initialize() {
  try {
    const user = await getCurrentUser();

    if (user) {
      renderTemporaryDashboard(user);
      return;
    }

    renderLogin();
  } catch (error) {
    console.error("Erro ao iniciar:", error);
    renderLogin();
  }
}

initialize();