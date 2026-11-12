/**
 * Cartão "solto" que acompanha o mouse/dedo ao arrastar um agendamento.
 * Ele fica pendurado no ponto onde a pessoa pegou e balança como um pêndulo
 * conforme a velocidade do movimento (inclina para o lado e volta, com mola).
 * Roda direto no DOM com requestAnimationFrame (sem re-render do React).
 */

const MAX_ANGLE = 24;
/** Quanto a velocidade lateral inclina o cartão */
const TILT_PER_PX = 2.2;
/** Mola do balanço: força de volta e amortecimento (por quadro) */
const SPRING = 0.14;
const DAMPING = 0.19;
const LIFT_SCALE = 1.06;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export class DragGhost {
  private element: HTMLElement;
  private grabX: number;
  private grabY: number;
  private x: number;
  private y: number;
  private lastX: number;
  private velocity = 0;
  private angle = 0;
  private angularVelocity = 0;
  private scale = 1;
  private frame = 0;
  private following = true;
  private reduced = prefersReducedMotion();

  constructor(source: HTMLElement, pointerX: number, pointerY: number) {
    const rect = source.getBoundingClientRect();

    this.grabX = pointerX - rect.left;
    this.grabY = pointerY - rect.top;
    this.x = pointerX;
    this.y = pointerY;
    this.lastX = pointerX;

    // Cópia visual do agendamento, solta por cima de tudo
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.remove("is-dragging");
    clone.classList.add("agenda-drag-ghost");
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      transformOrigin: `${this.grabX}px ${this.grabY}px`,
      transform: this.transform()
    });

    document.body.appendChild(clone);
    this.element = clone;
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  private transform() {
    return `translate(${this.x - this.grabX}px, ${this.y - this.grabY}px) rotate(${this.angle}deg) scale(${this.scale})`;
  }

  /** Mouse/dedo andou */
  move(pointerX: number, pointerY: number) {
    this.x = pointerX;
    this.y = pointerY;
  }

  private tick() {
    // Velocidade lateral suavizada (px por quadro)
    const dx = this.x - this.lastX;
    this.lastX = this.x;
    this.velocity = this.velocity * 0.7 + dx * 0.3;

    if (this.reduced) {
      this.angle = 0;
      this.scale = this.following ? LIFT_SCALE : 1;
    } else {
      // Pêndulo: indo para a direita, a parte de baixo fica para trás (gira no sentido horário)
      const target = this.following
        ? Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, this.velocity * TILT_PER_PX))
        : 0;
      const acceleration = (target - this.angle) * SPRING - this.angularVelocity * DAMPING;
      this.angularVelocity += acceleration;
      this.angle += this.angularVelocity;
      this.scale += ((this.following ? LIFT_SCALE : 1) - this.scale) * 0.25;
    }

    this.element.style.transform = this.transform();
    this.frame = requestAnimationFrame(this.tick);
  }

  /**
   * Soltou: o cartão vai até o lugar (rect) e assenta, depois some.
   * Sem lugar (soltou fora), volta para a origem.
   */
  land(target: DOMRect | null, origin: DOMRect | null) {
    this.following = false;

    const place = target ?? origin;

    if (!place || this.reduced) {
      this.remove(120);
      return;
    }

    // Leva o ponto de pega até a posição equivalente no destino
    const destinationX = place.left + Math.min(this.grabX, place.width);
    const destinationY = place.top + Math.min(this.grabY, place.height);
    const startX = this.x;
    const startY = this.y;
    const started = performance.now();
    const duration = 260;

    const glide = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // Desacelera chegando, com um leve passo além (mola)
      const eased = 1 - Math.pow(1 - progress, 3) * Math.cos(progress * Math.PI * 0.9);
      this.x = startX + (destinationX - startX) * eased;
      this.y = startY + (destinationY - startY) * eased;
      this.lastX = this.x;

      if (progress < 1) {
        requestAnimationFrame(glide);
      } else {
        this.remove(140);
      }
    };

    requestAnimationFrame(glide);
  }

  /** Some suavemente e sai do DOM */
  remove(fadeMs = 0) {
    const element = this.element;

    const finish = () => {
      cancelAnimationFrame(this.frame);
      element.remove();
    };

    if (fadeMs <= 0) {
      finish();
      return;
    }

    element.style.transition = `opacity ${fadeMs}ms ease`;
    element.style.opacity = "0";
    window.setTimeout(finish, fadeMs);
  }
}
