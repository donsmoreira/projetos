/**
 * Tabelas oficiais da NFS-e nacional, carregadas só quando a tela precisa
 * (ficam fora do pacote principal do site).
 *
 * Para atualizar: baixar a versão nova do Anexo VII / Anexo VIII no portal
 * da NFS-e (gov.br/nfse) e a tabela de classificação tributária da SVRS,
 * e gerar de novo nbs.ts, indOp.ts e classTrib.ts.
 */
export type NfseTables = {
  /** [código NBS 9 dígitos, descrição, itens da LC 116 (4 dígitos) separados por vírgula] */
  nbs: [string, string, string][];
  /** [código, tipo de operação, característica, local do fornecimento] */
  indOp: [string, string, string, string][];
  /** [CST, nome] */
  cst: [string, string][];
  /** [cClassTrib, CST, nome curto, nome completo] */
  classTrib: [string, string, string, string][];
};

let cache: Promise<NfseTables> | null = null;

export function loadNfseTables(): Promise<NfseTables> {
  if (!cache) {
    cache = Promise.all([import("./nbs"), import("./indOp"), import("./classTrib")])
      .then(([nbs, indOp, classTrib]) => ({
        nbs: nbs.NBS_TABLE,
        indOp: indOp.IND_OP_TABLE,
        cst: classTrib.CST_IBS_CBS_TABLE,
        classTrib: classTrib.CLASS_TRIB_TABLE
      }))
      .catch(error => {
        cache = null;
        throw error;
      });
  }

  return cache;
}
