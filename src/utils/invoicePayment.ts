import type { BankAccount } from "../types/bankAccount";
import type { ServiceInvoiceFormData } from "../types/serviceInvoice";
import { addMonthsClamped, previewInstallments } from "./entryBatch";

export type PaymentPlanRow = {
  installment: number;
  dueDate: string;
  value: number;
  /** já entra como recebida (à vista) */
  received: boolean;
};

/** 1º vencimento a prazo: o informado ou um mês depois da emissão */
export function firstDueDateFor(form: Pick<ServiceInvoiceFormData, "firstDueDate" | "issueDate">) {
  return form.firstDueDate || addMonthsClamped(form.issueDate, 1);
}

/**
 * Mesma conta da função service_invoice_payment_plan do banco: valor líquido
 * da nota dividido nas parcelas, centavos que sobram na 1ª, vencimentos mensais.
 */
export function previewPaymentPlan(form: ServiceInvoiceFormData, netAmount: number): PaymentPlanRow[] {
  const totalCents = Math.round(Math.max(0, netAmount) * 100);

  if (form.paymentTerm === "a_vista") {
    return [{ installment: 1, dueDate: form.issueDate, value: totalCents / 100, received: true }];
  }

  return previewInstallments(totalCents, form.installments, firstDueDateFor(form)).map(row => ({
    installment: row.index,
    dueDate: row.dueDate,
    value: row.cents / 100,
    received: false
  }));
}

/** Tipo de conta que recebe: dinheiro vai para caixa; o resto para banco */
export function accountKindFor(method: ServiceInvoiceFormData["paymentMethod"]) {
  return method === "dinheiro" ? "caixa" : "banco";
}

/** O que falta na forma de pagamento para emitir */
export function paymentMissing(form: ServiceInvoiceFormData, accounts: BankAccount[]): string[] {
  const missing: string[] = [];
  const account = accounts.find(item => item.id === form.paymentAccountId);

  if (!form.paymentAccountId) {
    missing.push(form.paymentMethod === "dinheiro" ? "o caixa que recebe" : "a conta bancária que recebe");
  } else if (account && account.account_type !== accountKindFor(form.paymentMethod)) {
    missing.push(form.paymentMethod === "dinheiro" ? "um caixa (dinheiro)" : "uma conta bancária");
  }

  if (form.paymentTerm === "a_prazo") {
    const max = form.paymentMethod === "credito" ? 24 : 60;
    if (!(form.installments >= 1 && form.installments <= max)) missing.push(`número de parcelas (1 a ${max})`);
    if (form.firstDueDate && form.firstDueDate < form.issueDate) missing.push("1º vencimento depois da emissão");
  }

  return missing;
}
