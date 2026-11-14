/**
 * Avisos e confirmações na janela do próprio sistema
 * (no lugar das caixas do navegador: window.alert / window.confirm).
 *
 * Uso:
 *   if (!(await appConfirm("Excluir o cliente?"))) return;
 *   await appAlert("Não foi possível salvar.");
 */

export type DialogKind = "alert" | "confirm";

export type DialogTone = "danger" | "warning" | "info";

export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

export interface DialogRequest extends Required<Pick<DialogOptions, "title" | "confirmLabel" | "cancelLabel" | "tone">> {
  id: number;
  kind: DialogKind;
  message: string;
  resolve: (value: boolean) => void;
}

type Listener = (current: DialogRequest | null) => void;

const queue: DialogRequest[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function notify() {
  const current = queue[0] ?? null;
  listeners.forEach(listener => listener(current));
}

export function subscribeDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue[0] ?? null);

  return () => {
    listeners.delete(listener);
  };
}

/** Fecha a janela atual com a resposta dada e mostra a próxima da fila. */
export function answerDialog(id: number, value: boolean) {
  const index = queue.findIndex(item => item.id === id);

  if (index === -1) {
    return;
  }

  const [request] = queue.splice(index, 1);
  request.resolve(value);
  notify();
}

/** Escolhe título, botão e cor pelo texto da pergunta. */
function guessConfirm(message: string): Pick<DialogRequest, "title" | "confirmLabel" | "tone"> & { cancelLabel?: string } {
  const text = message.toLowerCase();

  if (text.includes("excluir")) {
    return { title: "Excluir", confirmLabel: "Sim", cancelLabel: "Não", tone: "danger" };
  }

  if (text.includes("estornar") || text.includes("desfazer")) {
    return { title: "Confirmar estorno", confirmLabel: "Estornar", tone: "danger" };
  }

  if (text.includes("reabrir")) {
    return { title: "Reabrir", confirmLabel: "Reabrir", tone: "warning" };
  }

  if (text.includes("inativar")) {
    return { title: "Inativar cadastro", confirmLabel: "Inativar", tone: "warning" };
  }

  if (text.includes("reativar")) {
    return { title: "Reativar cadastro", confirmLabel: "Reativar", tone: "info" };
  }

  return { title: "Confirmar", confirmLabel: "Confirmar", tone: "warning" };
}

function guessAlert(message: string): Pick<DialogRequest, "title" | "confirmLabel" | "tone"> {
  const text = message.toLowerCase();

  if (text.includes("não pode ser excluíd") || text.includes("não pode ser excluid")) {
    return { title: "Exclusão não permitida", confirmLabel: "Entendi", tone: "danger" };
  }

  if (text.startsWith("não foi possível") || text.includes("erro")) {
    return { title: "Não foi possível concluir", confirmLabel: "Entendi", tone: "danger" };
  }

  return { title: "Aviso", confirmLabel: "Entendi", tone: "warning" };
}

function open(kind: DialogKind, message: string, options: DialogOptions): Promise<boolean> {
  return new Promise(resolve => {
    const guessed: Pick<DialogRequest, "title" | "confirmLabel" | "tone"> & { cancelLabel?: string } =
      kind === "confirm" ? guessConfirm(message) : guessAlert(message);

    queue.push({
      id: nextId++,
      kind,
      message,
      title: options.title ?? guessed.title,
      confirmLabel: options.confirmLabel ?? guessed.confirmLabel,
      cancelLabel: options.cancelLabel ?? guessed.cancelLabel ?? "Cancelar",
      tone: options.tone ?? guessed.tone,
      resolve
    });

    notify();
  });
}

/** Pergunta sim/não. Resolve true em "Confirmar" e false em "Cancelar", Esc ou clique fora. */
export function appConfirm(message: string, options: DialogOptions = {}): Promise<boolean> {
  return open("confirm", message, options);
}

/** Aviso com um botão só. */
export async function appAlert(message: string, options: DialogOptions = {}): Promise<void> {
  await open("alert", message, options);
}
