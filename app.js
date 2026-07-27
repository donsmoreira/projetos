/* =========================================================
   RAZÃO — Gestão Financeira
   Aplicação 100% local: dados salvos no localStorage do
   navegador. Nenhuma chamada de rede é feita.
========================================================= */
(function(){
  'use strict';

  const STORAGE_KEY = 'razao_gf_db_v1';

  /* ---------------- Storage ---------------- */
  function defaultDB(){
    return {
      suppliers: [],
      bankAccounts: [],
      bankTransactions: [],
      creditCards: [],
      cardTransactions: [],
      cardSettlements: [],
      payables: []
    };
  }

  let db = loadDB();

  function loadDB(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultDB();
      return Object.assign(defaultDB(), JSON.parse(raw));
    }catch(e){
      console.error('Falha ao ler dados salvos, iniciando vazio.', e);
      return defaultDB();
    }
  }

  function saveDB(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  /* ---------------- Utils ---------------- */
  function uid(prefix){
    return (prefix||'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function fmtMoney(v){
    v = Number(v) || 0;
    return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }
  function fmtDate(iso){
    if(!iso) return '—';
    const parts = iso.split('-');
    if(parts.length!==3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  function esc(s){
    if(s===null || s===undefined) return '';
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(()=>{ el.hidden = true; }, 2600);
  }

  /* ---------------- Cálculos ---------------- */
  function bankAccountBalance(accountId){
    const acc = db.bankAccounts.find(a=>a.id===accountId);
    if(!acc) return 0;
    const moves = db.bankTransactions
      .filter(t=>t.bankAccountId===accountId)
      .reduce((s,t)=>s + Number(t.value||0), 0);
    return (Number(acc.initialBalance)||0) + moves;
  }
  function totalBankBalance(){
    return db.bankAccounts.reduce((s,a)=>s + bankAccountBalance(a.id), 0);
  }
  function payableTotal(p){
    return (Number(p.value)||0) + (Number(p.interest)||0) + (Number(p.penalty)||0);
  }
  function cardOpenBalance(cardId){
    return db.cardTransactions
      .filter(t=>t.cardId===cardId && !t.settled)
      .reduce((s,t)=>s + Number(t.value||0), 0);
  }
  function totalOpenCards(){
    return db.creditCards.reduce((s,c)=>s + cardOpenBalance(c.id), 0);
  }
  function totalPayablesPending(){
    return db.payables.filter(p=>p.status==='pendente').reduce((s,p)=>s + payableTotal(p), 0);
  }
  function totalPayablesPaid(){
    return db.payables.filter(p=>p.status==='pago').reduce((s,p)=>s + payableTotal(p), 0);
  }
  function supplierName(id){ const s = db.suppliers.find(x=>x.id===id); return s ? s.name : '—'; }
  function bankAccountName(id){ const a = db.bankAccounts.find(x=>x.id===id); return a ? a.name : '—'; }
  function cardName(id){ const c = db.creditCards.find(x=>x.id===id); return c ? c.name : '—'; }

  /* ---------------- Regras de negócio ---------------- */
  function payPayableViaBank(payableId, bankAccountId){
    const p = db.payables.find(x=>x.id===payableId);
    const acc = db.bankAccounts.find(a=>a.id===bankAccountId);
    if(!p || !acc) return;
    const total = payableTotal(p);
    const tx = {
      id: uid('btx'), bankAccountId, date: todayISO(),
      description: 'Pagamento: ' + p.description + ' (' + supplierName(p.supplierId) + ')',
      value: -total, kind: 'payable_payment', refType: 'payable', refId: p.id, createdAt: Date.now()
    };
    db.bankTransactions.push(tx);
    Object.assign(p, {
      status: 'pago', paymentMethod: 'banco', paymentDate: todayISO(),
      bankAccountId, bankTransactionId: tx.id, cardId: null, cardTransactionId: null
    });
    saveDB();
  }

  function payPayableViaCard(payableId, cardId){
    const p = db.payables.find(x=>x.id===payableId);
    const card = db.creditCards.find(c=>c.id===cardId);
    if(!p || !card) return;
    const total = payableTotal(p);
    const ctx = {
      id: uid('ctx'), cardId, date: todayISO(),
      description: p.description + ' (' + supplierName(p.supplierId) + ')',
      value: total, payableId: p.id, settled: false, settlementId: null, createdAt: Date.now()
    };
    db.cardTransactions.push(ctx);
    Object.assign(p, {
      status: 'pago', paymentMethod: 'cartao', paymentDate: todayISO(),
      cardId, cardTransactionId: ctx.id, bankAccountId: null, bankTransactionId: null
    });
    saveDB();
  }

  function reversePayablePayment(payableId){
    const p = db.payables.find(x=>x.id===payableId);
    if(!p) return;
    if(p.paymentMethod === 'banco' && p.bankTransactionId){
      db.bankTransactions = db.bankTransactions.filter(t=>t.id!==p.bankTransactionId);
    }
    if(p.paymentMethod === 'cartao' && p.cardTransactionId){
      const ct = db.cardTransactions.find(t=>t.id===p.cardTransactionId);
      if(ct && ct.settled){ toast('Estorne a baixa da fatura do cartão antes de reverter esta conta.'); return; }
      db.cardTransactions = db.cardTransactions.filter(t=>t.id!==p.cardTransactionId);
    }
    Object.assign(p, {
      status: 'pendente', paymentMethod: null, paymentDate: null,
      bankAccountId: null, bankTransactionId: null, cardId: null, cardTransactionId: null
    });
    saveDB();
  }

  function deleteBankTransaction(txId){
    const tx = db.bankTransactions.find(t=>t.id===txId);
    if(!tx) return;
    if(tx.refType === 'payable'){
      const p = db.payables.find(x=>x.id===tx.refId);
      if(p) Object.assign(p, { status:'pendente', paymentMethod:null, paymentDate:null, bankAccountId:null, bankTransactionId:null });
    }
    if(tx.refType === 'card_settlement'){
      db.cardTransactions.forEach(ct=>{
        if(ct.settlementId === tx.refId){ ct.settled = false; ct.settlementId = null; }
      });
      db.cardSettlements = db.cardSettlements.filter(s=>s.id !== tx.refId);
    }
    db.bankTransactions = db.bankTransactions.filter(t=>t.id!==txId);
    saveDB();
  }

  function deleteCardTransaction(txId){
    const tx = db.cardTransactions.find(t=>t.id===txId);
    if(!tx) return;
    if(tx.settled){ toast('Este lançamento já foi quitado. Estorne a baixa da fatura primeiro.'); return; }
    if(tx.payableId){
      const p = db.payables.find(x=>x.id===tx.payableId);
      if(p) Object.assign(p, { status:'pendente', paymentMethod:null, paymentDate:null, cardId:null, cardTransactionId:null });
    }
    db.cardTransactions = db.cardTransactions.filter(t=>t.id!==txId);
    saveDB();
  }

  /* ---------------- Limpar todos os dados ---------------- */
  function resetAllData(){
    if(!confirm('Isso vai apagar TODOS os dados salvos (fornecedores, contas, cartões e contas a pagar) e não pode ser desfeito. Continuar?')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('razao_gf_seeded');
    db = defaultDB();
    selectedBankId = null;
    selectedCardId = null;
    saveDB();
    renderTab();
    toast('Todos os dados foram apagados.');
  }

  /* ---------------- Modal ---------------- */
  const modalOverlay = document.getElementById('modal-overlay');
  const modalBody = document.getElementById('modal-body');

  function openModal(html){
    modalBody.innerHTML = html;
    modalOverlay.hidden = false;
  }
  function closeModal(){
    modalOverlay.hidden = true;
    modalBody.innerHTML = '';
  }

  /* ---------------- Opções de select reutilizáveis ---------------- */
  function supplierOptions(selected){
    if(!db.suppliers.length) return '<option value="">Nenhum fornecedor cadastrado</option>';
    return db.suppliers.map(s=>`<option value="${s.id}" ${s.id===selected?'selected':''}>${esc(s.name)}</option>`).join('');
  }
  function bankAccountOptions(selected){
    if(!db.bankAccounts.length) return '<option value="">Nenhuma conta cadastrada</option>';
    return db.bankAccounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)} — ${esc(a.bank||'')}</option>`).join('');
  }

  /* ================================================================
     PAINEL
  ================================================================= */
  function renderDashboard(){
    const pendentes = db.payables.filter(p=>p.status==='pendente').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,6);
    const bancosRows = db.bankAccounts.slice(0,5).map(a=>{
      const bal = bankAccountBalance(a.id);
      return `<tr>
        <td>${esc(a.name)}</td>
        <td>${esc(a.bank||'—')}</td>
        <td class="num ${bal<0?'num-debit':'num-credit'}">${fmtMoney(bal)}</td>
      </tr>`;
    }).join('') || '<tr class="empty-row"><td colspan="3">Nenhuma conta bancária cadastrada ainda.</td></tr>';

    const venctoRows = pendentes.map(p=>`
      <tr>
        <td>${esc(supplierName(p.supplierId))}</td>
        <td>${esc(p.description)}</td>
        <td>${fmtDate(p.dueDate)}</td>
        <td class="num">${fmtMoney(payableTotal(p))}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Nenhuma conta pendente. Tudo em dia.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Total a pagar</span><strong style="color:var(--debit)">${fmtMoney(totalPayablesPending())}</strong></div>
        <div class="summary-box"><span>Já pago</span><strong style="color:var(--credit)">${fmtMoney(totalPayablesPaid())}</strong></div>
        <div class="summary-box"><span>Saldo em contas</span><strong>${fmtMoney(totalBankBalance())}</strong></div>
        <div class="summary-box"><span>Faturas de cartão em aberto</span><strong style="color:var(--debit)">${fmtMoney(totalOpenCards())}</strong></div>
      </div>

      <div class="breakdown-grid">
        <div class="panel">
          <div class="panel-head"><h2>Próximos vencimentos</h2><span class="panel-sub">${pendentes.length} de ${db.payables.filter(p=>p.status==='pendente').length} pendentes</span></div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Fornecedor</th><th>Descrição</th><th>Vencimento</th><th class="num">Total</th></tr></thead>
            <tbody>${venctoRows}</tbody>
          </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Contas bancárias</h2></div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Conta</th><th>Banco</th><th class="num">Saldo</th></tr></thead>
            <tbody>${bancosRows}</tbody>
          </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ================================================================
     FORNECEDORES
  ================================================================= */
  function renderSuppliers(){
    const rows = db.suppliers.map(s=>`
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.type||'—')}</td>
        <td>${esc(s.document||'—')}</td>
        <td>${esc(s.phone||'—')}<br><span style="color:var(--ink-soft);font-size:11.5px">${esc(s.email||'')}</span></td>
        <td class="actions">
          <button class="link-btn" data-action="edit-supplier" data-id="${s.id}">Editar</button>
          <button class="link-btn danger" data-action="delete-supplier" data-id="${s.id}">Excluir</button>
        </td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="5">Nenhum fornecedor cadastrado. Clique em "Novo fornecedor" para começar.</td></tr>';

    return `
      <div class="panel">
        <div class="panel-head">
          <div><h2>Fornecedores de produtos e serviços</h2><p class="panel-sub">Cadastre quem você paga: fornecedores, prestadores de serviço, etc.</p></div>
          <button class="btn" data-action="add-supplier">+ Novo fornecedor</button>
        </div>
        <table class="ledger">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Documento</th><th>Contato</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function supplierFormHTML(existing){
    const e = existing || {};
    return `
      <h2>${existing ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
      <p class="modal-sub">Dados de quem recebe pagamentos seus.</p>
      <form id="form-supplier" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Nome / Razão social</label>
            <input type="text" id="f-name" value="${esc(e.name||'')}" required autofocus>
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="f-type">
              <option ${e.type==='Produto'?'selected':''}>Produto</option>
              <option ${e.type==='Serviço'?'selected':''}>Serviço</option>
              <option ${e.type==='Produto e Serviço'?'selected':''}>Produto e Serviço</option>
            </select>
          </div>
          <div class="field">
            <label>CNPJ / CPF</label>
            <input type="text" id="f-document" value="${esc(e.document||'')}" placeholder="00.000.000/0000-00">
          </div>
          <div class="field">
            <label>Telefone</label>
            <input type="text" id="f-phone" value="${esc(e.phone||'')}">
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" id="f-email" value="${esc(e.email||'')}">
          </div>
          <div class="field full">
            <label>Observações</label>
            <textarea id="f-notes">${esc(e.notes||'')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar fornecedor</button>
        </div>
      </form>
    `;
  }

  function saveSupplierForm(form){
    const editId = form.dataset.editId;
    const data = {
      name: document.getElementById('f-name').value.trim(),
      type: document.getElementById('f-type').value,
      document: document.getElementById('f-document').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      notes: document.getElementById('f-notes').value.trim()
    };
    if(!data.name){ toast('Informe o nome do fornecedor.'); return; }
    if(editId){
      const s = db.suppliers.find(x=>x.id===editId);
      Object.assign(s, data);
      toast('Fornecedor atualizado.');
    }else{
      db.suppliers.push(Object.assign({ id: uid('sup'), createdAt: Date.now() }, data));
      toast('Fornecedor cadastrado.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deleteSupplier(id){
    const inUse = db.payables.some(p=>p.supplierId===id);
    if(inUse){
      alert('Este fornecedor possui contas a pagar vinculadas. Exclua ou reatribua essas contas antes de remover o fornecedor.');
      return;
    }
    if(!confirm('Excluir este fornecedor?')) return;
    db.suppliers = db.suppliers.filter(s=>s.id!==id);
    saveDB();
    renderTab();
    toast('Fornecedor excluído.');
  }

  /* ================================================================
     CONTAS BANCÁRIAS
  ================================================================= */
  let selectedBankId = null;

  function renderBanks(){
    const cards = db.bankAccounts.map(a=>{
      const bal = bankAccountBalance(a.id);
      return `
      <div class="entity-card ${selectedBankId===a.id?'is-selected':''}" data-action="select-bank" data-id="${a.id}">
        <div class="entity-card-head">
          <div><h3>${esc(a.name)}</h3><span>${esc(a.bank||'')}${a.agency?(' · ag. '+esc(a.agency)):''}${a.number?(' · cc '+esc(a.number)):''}</span></div>
        </div>
        <div class="balance ${bal<0?'neg':'pos'}">${fmtMoney(bal)}</div>
        <div class="entity-card-foot">
          <button class="btn small" data-action="bank-move" data-id="${a.id}">Movimentar</button>
          <button class="btn small secondary" data-action="bank-pay-debt" data-id="${a.id}">Pagar conta a pagar</button>
          <button class="btn small secondary" data-action="edit-bank" data-id="${a.id}">Editar</button>
          <button class="btn small danger" data-action="delete-bank" data-id="${a.id}">Excluir</button>
        </div>
      </div>`;
    }).join('') || '';

    let detail = '';
    if(selectedBankId && db.bankAccounts.some(a=>a.id===selectedBankId)){
      const acc = db.bankAccounts.find(a=>a.id===selectedBankId);
      const txs = db.bankTransactions.filter(t=>t.bankAccountId===selectedBankId).sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
      const rows = txs.map(t=>`
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td>${esc(t.description)} ${t.refType ? `<span class="badge pago" style="margin-left:6px">vinculado</span>` : ''}</td>
          <td class="num ${t.value<0?'num-debit':'num-credit'}">${t.value<0?'- ':'+ '}${fmtMoney(Math.abs(t.value))}</td>
          <td class="actions"><button class="link-btn danger" data-action="delete-bank-tx" data-id="${t.id}">Excluir</button></td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Nenhuma movimentação nesta conta ainda.</td></tr>';

      detail = `
        <div class="panel detail-panel">
          <div class="detail-header">
            <h2>Extrato — ${esc(acc.name)}</h2>
            <span class="panel-sub">Saldo inicial: ${fmtMoney(acc.initialBalance)} · Saldo atual: <strong class="mono">${fmtMoney(bankAccountBalance(acc.id))}</strong></span>
          </div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          </div>
        </div>`;
    }

    return `
      <div class="panel-head" style="margin-bottom:16px;">
        <div><h2 style="font-family:var(--font-display)">Contas bancárias</h2><p class="panel-sub">Cadastre suas contas, lance entradas/saídas e vincule pagamentos de dívidas.</p></div>
        <button class="btn" data-action="add-bank">+ Nova conta bancária</button>
      </div>
      ${cards ? `<div class="card-grid">${cards}</div>` : '<div class="empty-state"><h3>Nenhuma conta bancária</h3><p>Cadastre a primeira conta para começar a registrar movimentações.</p></div>'}
      ${detail}
    `;
  }

  function bankFormHTML(existing){
    const e = existing || {};
    return `
      <h2>${existing ? 'Editar conta bancária' : 'Nova conta bancária'}</h2>
      <form id="form-bank" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Nome da conta</label>
            <input type="text" id="f-name" value="${esc(e.name||'')}" placeholder="Ex.: Conta Movimento" required autofocus>
          </div>
          <div class="field">
            <label>Banco</label>
            <input type="text" id="f-bank" value="${esc(e.bank||'')}">
          </div>
          <div class="field">
            <label>Agência</label>
            <input type="text" id="f-agency" value="${esc(e.agency||'')}">
          </div>
          <div class="field">
            <label>Conta</label>
            <input type="text" id="f-number" value="${esc(e.number||'')}">
          </div>
          <div class="field">
            <label>Saldo inicial</label>
            <input type="number" step="0.01" class="mono-input" id="f-initial" value="${e.initialBalance!==undefined?e.initialBalance:0}">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar conta</button>
        </div>
      </form>
    `;
  }

  function saveBankForm(form){
    const editId = form.dataset.editId;
    const data = {
      name: document.getElementById('f-name').value.trim(),
      bank: document.getElementById('f-bank').value.trim(),
      agency: document.getElementById('f-agency').value.trim(),
      number: document.getElementById('f-number').value.trim(),
      initialBalance: parseFloat(document.getElementById('f-initial').value) || 0
    };
    if(!data.name){ toast('Informe o nome da conta.'); return; }
    if(editId){
      Object.assign(db.bankAccounts.find(a=>a.id===editId), data);
      toast('Conta atualizada.');
    }else{
      const acc = Object.assign({ id: uid('acc'), createdAt: Date.now() }, data);
      db.bankAccounts.push(acc);
      selectedBankId = acc.id;
      toast('Conta bancária cadastrada.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deleteBank(id){
    const hasTx = db.bankTransactions.some(t=>t.bankAccountId===id);
    const hasCard = db.creditCards.some(c=>c.bankAccountId===id);
    if(hasTx || hasCard){
      alert('Esta conta possui movimentações e/ou cartões vinculados. Remova-os antes de excluir a conta.');
      return;
    }
    if(!confirm('Excluir esta conta bancária?')) return;
    db.bankAccounts = db.bankAccounts.filter(a=>a.id!==id);
    if(selectedBankId===id) selectedBankId = null;
    saveDB();
    renderTab();
    toast('Conta excluída.');
  }

  function bankMoveFormHTML(accountId){
    return `
      <h2>Movimentar conta</h2>
      <p class="modal-sub">${esc(bankAccountName(accountId))}</p>
      <form id="form-bank-move" data-account-id="${accountId}">
        <div class="method-toggle">
          <button type="button" class="is-active" data-toggle="tipo" data-value="entrada">Entrada</button>
          <button type="button" data-toggle="tipo" data-value="saida">Saída</button>
        </div>
        <input type="hidden" id="f-tipo" value="entrada">
        <div class="form-grid">
          <div class="field">
            <label>Valor</label>
            <input type="number" step="0.01" class="mono-input" id="f-valor" placeholder="0,00" required>
          </div>
          <div class="field">
            <label>Data</label>
            <input type="date" id="f-data" value="${todayISO()}" required>
          </div>
          <div class="field full">
            <label>Descrição</label>
            <input type="text" id="f-desc" placeholder="Ex.: Depósito, transferência, saque..." required>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Lançar</button>
        </div>
      </form>
    `;
  }

  function saveBankMoveForm(form){
    const accountId = form.dataset.accountId;
    const tipo = document.getElementById('f-tipo').value;
    const valor = parseFloat(document.getElementById('f-valor').value);
    if(!valor || valor<=0){ toast('Informe um valor válido.'); return; }
    const tx = {
      id: uid('btx'), bankAccountId: accountId,
      date: document.getElementById('f-data').value || todayISO(),
      description: document.getElementById('f-desc').value.trim() || (tipo==='entrada'?'Entrada manual':'Saída manual'),
      value: tipo==='saida' ? -Math.abs(valor) : Math.abs(valor),
      kind: 'manual', refType: null, refId: null, createdAt: Date.now()
    };
    db.bankTransactions.push(tx);
    saveDB();
    closeModal();
    renderTab();
    toast('Movimentação lançada.');
  }

  function bankPayDebtFormHTML(accountId){
    const pend = db.payables.filter(p=>p.status==='pendente').sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    const list = pend.map(p=>`
      <div class="option-row" data-action="pick-payable-for-bank" data-id="${p.id}">
        <div>
          <div class="o-title">${esc(supplierName(p.supplierId))}</div>
          <div class="o-sub">${esc(p.description)} · vence ${fmtDate(p.dueDate)}</div>
        </div>
        <div class="o-val">${fmtMoney(payableTotal(p))}</div>
      </div>`).join('') || '<div class="empty-state"><p>Nenhuma conta a pagar pendente.</p></div>';

    return `
      <h2>Pagar conta a pagar</h2>
      <p class="modal-sub">Debitando de <strong>${esc(bankAccountName(accountId))}</strong> (saldo atual: ${fmtMoney(bankAccountBalance(accountId))}). Selecione a dívida a quitar:</p>
      <div class="option-list" data-account-id="${accountId}">${list}</div>
      <div class="form-actions">
        <button type="button" class="btn secondary" data-action="close-modal">Fechar</button>
      </div>
    `;
  }

  /* ================================================================
     CONTAS A PAGAR
  ================================================================= */
  function renderPayables(){
    const sorted = db.payables.slice().sort((a,b)=> (a.status===b.status?0:(a.status==='pendente'?-1:1)) || a.dueDate.localeCompare(b.dueDate));
    const rows = sorted.map(p=>{
      const total = payableTotal(p);
      const vencida = p.status==='pendente' && p.dueDate < todayISO();
      const paidVia = p.status==='pago' ? (p.paymentMethod==='banco' ? ('Conta: '+bankAccountName(p.bankAccountId)) : ('Cartão: '+cardName(p.cardId))) : '—';
      return `
      <tr>
        <td>${esc(supplierName(p.supplierId))}</td>
        <td>${esc(p.description)}</td>
        <td>${fmtDate(p.issueDate)}</td>
        <td>${fmtDate(p.dueDate)}${vencida?' <span class="badge aberto">vencida</span>':''}</td>
        <td class="num">${fmtMoney(p.value)}</td>
        <td class="num">${p.interest ? fmtMoney(p.interest) : '—'}</td>
        <td class="num">${p.penalty ? fmtMoney(p.penalty) : '—'}</td>
        <td class="num"><strong>${fmtMoney(total)}</strong></td>
        <td><span class="badge ${p.status}">${p.status==='pago'?'Pago':'Pendente'}</span><br><span style="font-size:11px;color:var(--ink-soft)">${paidVia}</span></td>
        <td class="actions">
          ${p.status==='pendente' ? `<button class="link-btn" data-action="pay-payable" data-id="${p.id}">Pagar</button>` : `<button class="link-btn" data-action="reverse-payable" data-id="${p.id}">Estornar</button>`}
          <button class="link-btn" data-action="edit-payable" data-id="${p.id}">Editar</button>
          <button class="link-btn danger" data-action="delete-payable" data-id="${p.id}">Excluir</button>
        </td>
      </tr>`;
    }).join('') || '<tr class="empty-row"><td colspan="10">Nenhuma conta a pagar cadastrada.</td></tr>';

    return `
      <div class="panel">
        <div class="panel-head">
          <div><h2>Contas a pagar</h2><p class="panel-sub">Juros e multa somam ao total automaticamente quando preenchidos.</p></div>
          <button class="btn" data-action="add-payable">+ Nova conta a pagar</button>
        </div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr>
            <th>Fornecedor</th><th>Descrição</th><th>Emissão</th><th>Vencimento</th>
            <th class="num">Valor</th><th class="num">Juros</th><th class="num">Multa</th><th class="num">Total</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  function payableFormHTML(existing){
    if(!db.suppliers.length){
      return `
        <h2>Nova conta a pagar</h2>
        <div class="empty-state">
          <h3>Cadastre um fornecedor primeiro</h3>
          <p>Toda conta a pagar precisa estar vinculada a um fornecedor.</p>
          <button class="btn" data-action="goto-fornecedores-from-modal">Ir para Fornecedores</button>
        </div>`;
    }
    const e = existing || {};
    const total = existing ? payableTotal(e) : 0;
    return `
      <h2>${existing ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h2>
      <form id="form-payable" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Fornecedor</label>
            <select id="f-supplier" required>${supplierOptions(e.supplierId)}</select>
          </div>
          <div class="field full">
            <label>Descrição</label>
            <input type="text" id="f-desc" value="${esc(e.description||'')}" required>
          </div>
          <div class="field">
            <label>Valor original</label>
            <input type="number" step="0.01" class="mono-input calc-field" id="f-valor" value="${e.value!==undefined?e.value:''}" required>
          </div>
          <div class="field">
            <label>Juros</label>
            <input type="number" step="0.01" class="mono-input calc-field" id="f-juros" value="${e.interest||''}" placeholder="0,00">
          </div>
          <div class="field">
            <label>Multa</label>
            <input type="number" step="0.01" class="mono-input calc-field" id="f-multa" value="${e.penalty||''}" placeholder="0,00">
          </div>
          <div class="field">
            <label>Data de emissão</label>
            <input type="date" id="f-emissao" value="${e.issueDate||todayISO()}" required>
          </div>
          <div class="field">
            <label>Data de vencimento</label>
            <input type="date" id="f-vencimento" value="${e.dueDate||todayISO()}" required>
          </div>
        </div>
        <div class="total-line">
          <span>Total da dívida</span>
          <strong id="payable-total-preview">${fmtMoney(total)}</strong>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar conta a pagar</button>
        </div>
      </form>
    `;
  }

  function recalcPayablePreview(){
    const v = parseFloat(document.getElementById('f-valor')?.value) || 0;
    const j = parseFloat(document.getElementById('f-juros')?.value) || 0;
    const m = parseFloat(document.getElementById('f-multa')?.value) || 0;
    const el = document.getElementById('payable-total-preview');
    if(el) el.textContent = fmtMoney(v+j+m);
  }

  function savePayableForm(form){
    const editId = form.dataset.editId;
    const data = {
      supplierId: document.getElementById('f-supplier').value,
      description: document.getElementById('f-desc').value.trim(),
      value: parseFloat(document.getElementById('f-valor').value) || 0,
      interest: parseFloat(document.getElementById('f-juros').value) || 0,
      penalty: parseFloat(document.getElementById('f-multa').value) || 0,
      issueDate: document.getElementById('f-emissao').value,
      dueDate: document.getElementById('f-vencimento').value
    };
    if(!data.supplierId){ toast('Selecione um fornecedor.'); return; }
    if(!data.description){ toast('Informe a descrição.'); return; }
    if(editId){
      Object.assign(db.payables.find(p=>p.id===editId), data);
      toast('Conta a pagar atualizada.');
    }else{
      db.payables.push(Object.assign({
        id: uid('pay'), status:'pendente', paymentMethod:null, paymentDate:null,
        bankAccountId:null, bankTransactionId:null, cardId:null, cardTransactionId:null,
        createdAt: Date.now()
      }, data));
      toast('Conta a pagar cadastrada.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deletePayable(id){
    const p = db.payables.find(x=>x.id===id);
    if(!p) return;
    if(p.status==='pago'){
      alert('Esta conta já foi paga. Estorne o pagamento antes de excluí-la.');
      return;
    }
    if(!confirm('Excluir esta conta a pagar?')) return;
    db.payables = db.payables.filter(x=>x.id!==id);
    saveDB();
    renderTab();
    toast('Conta a pagar excluída.');
  }

  function payPayableFormHTML(payableId){
    const p = db.payables.find(x=>x.id===payableId);
    if(!p) return '';
    const total = payableTotal(p);
    const bankList = db.bankAccounts.map(a=>`
      <div class="option-row" data-action="pick-bank-for-pay" data-id="${a.id}">
        <div><div class="o-title">${esc(a.name)}</div><div class="o-sub">${esc(a.bank||'')}</div></div>
        <div class="o-val">${fmtMoney(bankAccountBalance(a.id))}</div>
      </div>`).join('') || '<div class="empty-state"><p>Nenhuma conta bancária cadastrada.</p></div>';
    const cardList = db.creditCards.map(c=>`
      <div class="option-row" data-action="pick-card-for-pay" data-id="${c.id}">
        <div><div class="o-title">${esc(c.name)}</div><div class="o-sub">Fatura aberta</div></div>
        <div class="o-val">${fmtMoney(cardOpenBalance(c.id))}</div>
      </div>`).join('') || '<div class="empty-state"><p>Nenhum cartão cadastrado.</p></div>';

    return `
      <h2>Pagar conta a pagar</h2>
      <p class="modal-sub">${esc(p.description)} — ${esc(supplierName(p.supplierId))} · total <strong>${fmtMoney(total)}</strong></p>
      <div class="method-toggle">
        <button type="button" class="is-active" data-toggle="pay-method" data-value="banco">Conta bancária</button>
        <button type="button" data-toggle="pay-method" data-value="cartao">Cartão de crédito</button>
      </div>
      <div id="pay-method-banco">
        <div class="option-list">${bankList}</div>
      </div>
      <div id="pay-method-cartao" hidden>
        <div class="option-list">${cardList}</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
      </div>
    `;
  }

  /* ================================================================
     CARTÕES DE CRÉDITO
  ================================================================= */
  let selectedCardId = null;
  let settleSelection = new Set();

  function renderCards(){
    const cards = db.creditCards.map(c=>{
      const open = cardOpenBalance(c.id);
      return `
      <div class="entity-card ${selectedCardId===c.id?'is-selected':''}" data-action="select-card" data-id="${c.id}">
        <div class="entity-card-head">
          <div><h3>${esc(c.name)}</h3><span>${esc(c.brand||'')} · vinculado a ${esc(bankAccountName(c.bankAccountId))}</span></div>
        </div>
        <div class="balance ${open>0?'neg':''}">${fmtMoney(open)}</div>
        <div class="entity-card-foot">
          <button class="btn small" data-action="card-purchase" data-id="${c.id}">Novo lançamento</button>
          <button class="btn small secondary" data-action="card-settle" data-id="${c.id}">Dar baixa</button>
          <button class="btn small secondary" data-action="edit-card" data-id="${c.id}">Editar</button>
          <button class="btn small danger" data-action="delete-card" data-id="${c.id}">Excluir</button>
        </div>
      </div>`;
    }).join('');

    let detail = '';
    if(selectedCardId && db.creditCards.some(c=>c.id===selectedCardId)){
      const card = db.creditCards.find(c=>c.id===selectedCardId);
      const txs = db.cardTransactions.filter(t=>t.cardId===selectedCardId).sort((a,b)=>b.date.localeCompare(a.date));
      const rows = txs.map(t=>`
        <tr>
          <td>${fmtDate(t.date)}</td>
          <td>${esc(t.description)}</td>
          <td class="num">${fmtMoney(t.value)}</td>
          <td><span class="badge ${t.settled?'pago':'aberto'}">${t.settled?'Quitado':'Aberto'}</span></td>
          <td class="actions">${!t.settled ? `<button class="link-btn danger" data-action="delete-card-tx" data-id="${t.id}">Excluir</button>` : ''}</td>
        </tr>`).join('') || '<tr class="empty-row"><td colspan="5">Nenhum lançamento neste cartão.</td></tr>';

      detail = `
        <div class="panel detail-panel">
          <div class="detail-header">
            <h2>Lançamentos — ${esc(card.name)}</h2>
            <span class="panel-sub">Limite: ${fmtMoney(card.limit)} · Fatura aberta: <strong class="mono">${fmtMoney(cardOpenBalance(card.id))}</strong></span>
          </div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          </div>
        </div>`;
    }

    return `
      <div class="panel-head" style="margin-bottom:16px;">
        <div><h2 style="font-family:var(--font-display)">Cartões de crédito</h2><p class="panel-sub">Vincule o cartão a uma conta bancária para dar baixa direto na fatura.</p></div>
        <button class="btn" data-action="add-card">+ Novo cartão</button>
      </div>
      ${cards ? `<div class="card-grid">${cards}</div>` : '<div class="empty-state"><h3>Nenhum cartão cadastrado</h3><p>Cadastre um cartão para lançar compras e dar baixa nas faturas.</p></div>'}
      ${detail}
    `;
  }

  function cardFormHTML(existing){
    const e = existing || {};
    return `
      <h2>${existing ? 'Editar cartão' : 'Novo cartão de crédito'}</h2>
      <form id="form-card" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Nome do cartão</label>
            <input type="text" id="f-name" value="${esc(e.name||'')}" placeholder="Ex.: Cartão Empresarial" required autofocus>
          </div>
          <div class="field">
            <label>Bandeira</label>
            <input type="text" id="f-brand" value="${esc(e.brand||'')}" placeholder="Visa, Mastercard...">
          </div>
          <div class="field">
            <label>Conta bancária vinculada</label>
            <select id="f-bankaccount">
              <option value="">Nenhuma</option>
              ${bankAccountOptions(e.bankAccountId)}
            </select>
          </div>
          <div class="field">
            <label>Limite</label>
            <input type="number" step="0.01" class="mono-input" id="f-limit" value="${e.limit!==undefined?e.limit:''}">
          </div>
          <div class="field">
            <label>Dia de fechamento</label>
            <input type="number" min="1" max="31" id="f-closing" value="${e.closingDay||''}">
          </div>
          <div class="field">
            <label>Dia de vencimento</label>
            <input type="number" min="1" max="31" id="f-due" value="${e.dueDay||''}">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar cartão</button>
        </div>
      </form>
    `;
  }

  function saveCardForm(form){
    const editId = form.dataset.editId;
    const data = {
      name: document.getElementById('f-name').value.trim(),
      brand: document.getElementById('f-brand').value.trim(),
      bankAccountId: document.getElementById('f-bankaccount').value || null,
      limit: parseFloat(document.getElementById('f-limit').value) || 0,
      closingDay: parseInt(document.getElementById('f-closing').value) || null,
      dueDay: parseInt(document.getElementById('f-due').value) || null
    };
    if(!data.name){ toast('Informe o nome do cartão.'); return; }
    if(editId){
      Object.assign(db.creditCards.find(c=>c.id===editId), data);
      toast('Cartão atualizado.');
    }else{
      const c = Object.assign({ id: uid('card'), createdAt: Date.now() }, data);
      db.creditCards.push(c);
      selectedCardId = c.id;
      toast('Cartão cadastrado.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deleteCard(id){
    const hasTx = db.cardTransactions.some(t=>t.cardId===id);
    if(hasTx){
      alert('Este cartão possui lançamentos vinculados. Remova-os antes de excluir o cartão.');
      return;
    }
    if(!confirm('Excluir este cartão?')) return;
    db.creditCards = db.creditCards.filter(c=>c.id!==id);
    if(selectedCardId===id) selectedCardId = null;
    saveDB();
    renderTab();
    toast('Cartão excluído.');
  }

  function cardPurchaseFormHTML(cardId){
    return `
      <h2>Novo lançamento no cartão</h2>
      <p class="modal-sub">${esc(cardName(cardId))}</p>
      <form id="form-card-purchase" data-card-id="${cardId}">
        <div class="form-grid">
          <div class="field">
            <label>Valor</label>
            <input type="number" step="0.01" class="mono-input" id="f-valor" required>
          </div>
          <div class="field">
            <label>Data</label>
            <input type="date" id="f-data" value="${todayISO()}" required>
          </div>
          <div class="field full">
            <label>Descrição</label>
            <input type="text" id="f-desc" placeholder="Ex.: Compra de suprimentos" required>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Lançar compra</button>
        </div>
      </form>
    `;
  }

  function saveCardPurchaseForm(form){
    const cardId = form.dataset.cardId;
    const valor = parseFloat(document.getElementById('f-valor').value);
    if(!valor || valor<=0){ toast('Informe um valor válido.'); return; }
    db.cardTransactions.push({
      id: uid('ctx'), cardId,
      date: document.getElementById('f-data').value || todayISO(),
      description: document.getElementById('f-desc').value.trim() || 'Lançamento no cartão',
      value: Math.abs(valor), payableId: null, settled:false, settlementId:null, createdAt: Date.now()
    });
    saveDB();
    closeModal();
    renderTab();
    toast('Lançamento adicionado ao cartão.');
  }

  function cardSettleFormHTML(cardId){
    const card = db.creditCards.find(c=>c.id===cardId);
    const openTx = db.cardTransactions.filter(t=>t.cardId===cardId && !t.settled).sort((a,b)=>a.date.localeCompare(b.date));
    settleSelection = new Set(openTx.map(t=>t.id));

    if(!card.bankAccountId){
      return `
        <h2>Dar baixa — ${esc(card.name)}</h2>
        <div class="empty-state">
          <h3>Este cartão não está vinculado a uma conta bancária</h3>
          <p>Edite o cartão e selecione a conta que será debitada para poder dar baixa na fatura.</p>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Fechar</button></div>
      `;
    }
    if(!openTx.length){
      return `
        <h2>Dar baixa — ${esc(card.name)}</h2>
        <div class="empty-state"><h3>Nenhum lançamento em aberto</h3><p>Este cartão não possui fatura pendente.</p></div>
        <div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Fechar</button></div>
      `;
    }
    const rows = openTx.map(t=>`
      <div class="option-row is-selected" data-action="toggle-settle-tx" data-id="${t.id}">
        <div><div class="o-title">${esc(t.description)}</div><div class="o-sub">${fmtDate(t.date)}</div></div>
        <div class="o-val">${fmtMoney(t.value)}</div>
      </div>`).join('');

    return `
      <h2>Dar baixa — ${esc(card.name)}</h2>
      <p class="modal-sub">Debitando de <strong>${esc(bankAccountName(card.bankAccountId))}</strong> (saldo: ${fmtMoney(bankAccountBalance(card.bankAccountId))}). Desmarque o que não quer quitar agora:</p>
      <div class="option-list" id="settle-list" data-card-id="${cardId}">${rows}</div>
      <div class="total-line">
        <span>Total selecionado</span>
        <strong id="settle-total">${fmtMoney(openTx.reduce((s,t)=>s+t.value,0))}</strong>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
        <button type="button" class="btn" data-action="confirm-settle" data-id="${cardId}">Confirmar baixa</button>
      </div>
    `;
  }

  function updateSettleTotal(){
    const total = Array.from(settleSelection).reduce((s,id)=>{
      const t = db.cardTransactions.find(x=>x.id===id);
      return s + (t ? t.value : 0);
    },0);
    const el = document.getElementById('settle-total');
    if(el) el.textContent = fmtMoney(total);
  }

  function confirmSettle(cardId){
    const card = db.creditCards.find(c=>c.id===cardId);
    if(!card || !card.bankAccountId) return;
    const ids = Array.from(settleSelection);
    if(!ids.length){ toast('Selecione ao menos um lançamento.'); return; }
    const total = ids.reduce((s,id)=>{
      const t = db.cardTransactions.find(x=>x.id===id);
      return s + (t ? t.value : 0);
    },0);
    const settlement = { id: uid('sett'), cardId, date: todayISO(), value: total, bankTransactionId: null, createdAt: Date.now() };
    const bankTx = {
      id: uid('btx'), bankAccountId: card.bankAccountId, date: todayISO(),
      description: 'Pagamento de fatura — ' + card.name,
      value: -total, kind: 'card_settlement', refType: 'card_settlement', refId: settlement.id, createdAt: Date.now()
    };
    settlement.bankTransactionId = bankTx.id;
    db.bankTransactions.push(bankTx);
    db.cardSettlements.push(settlement);
    ids.forEach(id=>{
      const t = db.cardTransactions.find(x=>x.id===id);
      if(t){ t.settled = true; t.settlementId = settlement.id; }
    });
    saveDB();
    closeModal();
    renderTab();
    toast('Baixa realizada e conta debitada.');
  }

  /* ================================================================
     RELATÓRIOS
  ================================================================= */
  let reportFilters = { supplier:'all', card:'all', status:'all', from:'', to:'' };

  function filteredPayables(){
    return db.payables.filter(p=>{
      if(reportFilters.supplier!=='all' && p.supplierId!==reportFilters.supplier) return false;
      if(reportFilters.card==='none' && p.cardId) return false;
      if(reportFilters.card!=='all' && reportFilters.card!=='none' && p.cardId!==reportFilters.card) return false;
      if(reportFilters.status!=='all' && p.status!==reportFilters.status) return false;
      if(reportFilters.from && p.dueDate < reportFilters.from) return false;
      if(reportFilters.to && p.dueDate > reportFilters.to) return false;
      return true;
    });
  }

  function renderReports(){
    return `
      <div class="panel">
        <div class="panel-head"><h2>Filtrar dívidas</h2><span class="panel-sub">Vá afunilando do mais geral para o mais específico.</span></div>
        <div class="filter-steps">
          <div class="filter-step">
            <span class="step-label"><span class="step-num">1</span>Fornecedor</span>
            <select id="rf-supplier">
              <option value="all">Todos os fornecedores</option>
              ${db.suppliers.map(s=>`<option value="${s.id}" ${reportFilters.supplier===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">2</span>Cartão</span>
            <select id="rf-card">
              <option value="all">Todos</option>
              <option value="none" ${reportFilters.card==='none'?'selected':''}>Não pago com cartão</option>
              ${db.creditCards.map(c=>`<option value="${c.id}" ${reportFilters.card===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">3</span>Status</span>
            <select id="rf-status">
              <option value="all">Todos</option>
              <option value="pendente" ${reportFilters.status==='pendente'?'selected':''}>Pendente</option>
              <option value="pago" ${reportFilters.status==='pago'?'selected':''}>Pago</option>
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">4</span>Período (vencimento)</span>
            <div style="display:flex; gap:6px;">
              <input type="date" id="rf-from" value="${reportFilters.from}">
              <input type="date" id="rf-to" value="${reportFilters.to}">
            </div>
          </div>
        </div>
      </div>
      <div id="report-results">${reportResultsHTML()}</div>
    `;
  }

  function reportResultsHTML(){
    const list = filteredPayables();
    const totalGeral = list.reduce((s,p)=>s+payableTotal(p),0);
    const totalJuros = list.reduce((s,p)=>s+(Number(p.interest)||0),0);
    const totalMulta = list.reduce((s,p)=>s+(Number(p.penalty)||0),0);
    const totalPendente = list.filter(p=>p.status==='pendente').reduce((s,p)=>s+payableTotal(p),0);

    const bySupplier = {};
    list.forEach(p=>{ bySupplier[p.supplierId] = (bySupplier[p.supplierId]||0) + payableTotal(p); });
    const byCard = {};
    list.forEach(p=>{ if(p.cardId) byCard[p.cardId] = (byCard[p.cardId]||0) + payableTotal(p); });

    const rows = list.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(p=>`
      <tr>
        <td>${esc(supplierName(p.supplierId))}</td>
        <td>${esc(p.description)}</td>
        <td>${fmtDate(p.issueDate)}</td>
        <td>${fmtDate(p.dueDate)}</td>
        <td class="num">${fmtMoney(p.value)}</td>
        <td class="num">${p.interest ? fmtMoney(p.interest) : '—'}</td>
        <td class="num">${p.penalty ? fmtMoney(p.penalty) : '—'}</td>
        <td class="num"><strong>${fmtMoney(payableTotal(p))}</strong></td>
        <td><span class="badge ${p.status}">${p.status==='pago'?'Pago':'Pendente'}</span></td>
        <td>${p.paymentMethod==='cartao' ? esc(cardName(p.cardId)) : (p.paymentMethod==='banco' ? esc(bankAccountName(p.bankAccountId)) : '—')}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="10">Nenhum resultado para os filtros selecionados.</td></tr>';

    const supplierRows = Object.entries(bySupplier).map(([id,val])=>`
      <tr><td>${esc(supplierName(id))}</td><td class="num">${fmtMoney(val)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="2">Sem dados.</td></tr>';
    const cardRows = Object.entries(byCard).map(([id,val])=>`
      <tr><td>${esc(cardName(id))}</td><td class="num">${fmtMoney(val)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="2">Nenhuma conta paga com cartão neste filtro.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Resultados</span><strong>${list.length}</strong></div>
        <div class="summary-box"><span>Total geral</span><strong>${fmtMoney(totalGeral)}</strong></div>
        <div class="summary-box"><span>Juros + multas</span><strong>${fmtMoney(totalJuros+totalMulta)}</strong></div>
        <div class="summary-box"><span>Pendente no filtro</span><strong style="color:var(--debit)">${fmtMoney(totalPendente)}</strong></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Contas no filtro</h2></div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr>
            <th>Fornecedor</th><th>Descrição</th><th>Emissão</th><th>Vencimento</th>
            <th class="num">Valor</th><th class="num">Juros</th><th class="num">Multa</th><th class="num">Total</th>
            <th>Status</th><th>Pago via</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
      <div class="breakdown-grid">
        <div class="panel">
          <div class="panel-head"><h2>Total por fornecedor</h2></div>
          <table class="ledger"><thead><tr><th>Fornecedor</th><th class="num">Total</th></tr></thead><tbody>${supplierRows}</tbody></table>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Total por cartão</h2></div>
          <table class="ledger"><thead><tr><th>Cartão</th><th class="num">Total</th></tr></thead><tbody>${cardRows}</tbody></table>
        </div>
      </div>
    `;
  }

  function refreshReportResults(){
    const el = document.getElementById('report-results');
    if(el) el.innerHTML = reportResultsHTML();
  }

  /* ================================================================
     TABS / NAVEGAÇÃO
  ================================================================= */
  const TABS = {
    dashboard:    { title:'Painel',              render: renderDashboard },
    fornecedores: { title:'Fornecedores',        render: renderSuppliers },
    bancos:       { title:'Contas Bancárias',    render: renderBanks },
    pagar:        { title:'Contas a Pagar',      render: renderPayables },
    cartoes:      { title:'Cartões de Crédito',  render: renderCards },
    relatorios:   { title:'Relatórios',          render: renderReports }
  };
  let currentTab = 'dashboard';

  function renderTab(){
    const tab = TABS[currentTab];
    document.getElementById('page-title').textContent = tab.title;
    document.getElementById('tab-content').innerHTML = tab.render();
    renderTopbarChips();
    renderSidebarBalance();
  }

  function goToTab(name){
    currentTab = name;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('is-active', b.dataset.tab===name));
    renderTab();
  }

  function renderSidebarBalance(){
    document.getElementById('sidebar-saldo').textContent = fmtMoney(totalBankBalance());
  }
  function renderTopbarChips(){
    document.getElementById('topbar-chips').innerHTML = `
      <div class="chip debit"><span>A pagar</span><strong>${fmtMoney(totalPayablesPending())}</strong></div>
      <div class="chip"><span>Faturas abertas</span><strong>${fmtMoney(totalOpenCards())}</strong></div>
      <div class="chip credit"><span>Saldo em contas</span><strong>${fmtMoney(totalBankBalance())}</strong></div>
    `;
  }

  /* ================================================================
     BACKUP (exportar/importar)
  ================================================================= */
  function exportData(){
    const blob = new Blob([JSON.stringify(db, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'razao-backup-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup exportado.');
  }

  function importData(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result);
        if(!confirm('Importar este arquivo vai substituir todos os dados atuais. Continuar?')) return;
        db = Object.assign(defaultDB(), parsed);
        saveDB();
        selectedBankId = null; selectedCardId = null;
        renderTab();
        toast('Dados importados com sucesso.');
      }catch(e){
        alert('Arquivo inválido. Selecione um backup exportado por este sistema.');
      }
    };
    reader.readAsText(file);
  }

  /* ================================================================
     EVENTOS (delegação)
  ================================================================= */
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;

    switch(action){
      case 'close-modal': closeModal(); break;

      // Fornecedores
      case 'add-supplier': openModal(supplierFormHTML(null)); break;
      case 'edit-supplier': openModal(supplierFormHTML(db.suppliers.find(s=>s.id===id))); break;
      case 'delete-supplier': deleteSupplier(id); break;

      // Bancos
      case 'add-bank': openModal(bankFormHTML(null)); break;
      case 'edit-bank': openModal(bankFormHTML(db.bankAccounts.find(a=>a.id===id))); break;
      case 'delete-bank': deleteBank(id); break;
      case 'select-bank': selectedBankId = (selectedBankId===id ? null : id); renderTab(); break;
      case 'bank-move': openModal(bankMoveFormHTML(id)); break;
      case 'bank-pay-debt': openModal(bankPayDebtFormHTML(id)); break;
      case 'delete-bank-tx':
        if(confirm('Excluir esta movimentação? Se estiver vinculada a um pagamento, a conta voltará a ficar pendente.')){
          deleteBankTransaction(id); renderTab(); toast('Movimentação excluída.');
        }
        break;
      case 'pick-payable-for-bank': {
        const accountId = el.closest('.option-list').dataset.accountId;
        payPayableViaBank(id, accountId);
        closeModal(); renderTab(); toast('Conta paga e conta bancária debitada.');
        break;
      }

      // Contas a pagar
      case 'add-payable': openModal(payableFormHTML(null)); break;
      case 'edit-payable': openModal(payableFormHTML(db.payables.find(p=>p.id===id))); break;
      case 'delete-payable': deletePayable(id); break;
      case 'goto-fornecedores-from-modal': closeModal(); goToTab('fornecedores'); break;
      case 'pay-payable': openModal(payPayableFormHTML(id)); break;
      case 'reverse-payable':
        if(confirm('Reverter o pagamento desta conta? Ela voltará para pendente e o lançamento vinculado será removido.')){
          reversePayablePayment(id); renderTab(); toast('Pagamento revertido.');
        }
        break;
      // Cartões
      case 'add-card': openModal(cardFormHTML(null)); break;
      case 'edit-card': openModal(cardFormHTML(db.creditCards.find(c=>c.id===id))); break;
      case 'delete-card': deleteCard(id); break;
      case 'select-card': selectedCardId = (selectedCardId===id ? null : id); renderTab(); break;
      case 'card-purchase': openModal(cardPurchaseFormHTML(id)); break;
      case 'card-settle': openModal(cardSettleFormHTML(id)); break;
      case 'delete-card-tx':
        if(confirm('Excluir este lançamento do cartão?')){ deleteCardTransaction(id); renderTab(); toast('Lançamento excluído.'); }
        break;
      case 'toggle-settle-tx':
        if(settleSelection.has(id)){ settleSelection.delete(id); el.classList.remove('is-selected'); }
        else{ settleSelection.add(id); el.classList.add('is-selected'); }
        updateSettleTotal();
        break;
      case 'confirm-settle': confirmSettle(id); break;

      default: break;
    }
  });

  // Toggle "entrada/saída" no formulário de movimentação bancária
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-toggle="tipo"]');
    if(el){
      el.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('is-active'));
      el.classList.add('is-active');
      document.getElementById('f-tipo').value = el.dataset.value;
    }
  });

  // Toggle método de pagamento (banco/cartão) + seleção de conta/cartão no modal de pagar conta
  let payModalPayableId = null;
  document.addEventListener('click', (e)=>{
    const toggle = e.target.closest('[data-toggle="pay-method"]');
    if(toggle){
      toggle.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('is-active'));
      toggle.classList.add('is-active');
      const val = toggle.dataset.value;
      document.getElementById('pay-method-banco').hidden = val!=='banco';
      document.getElementById('pay-method-cartao').hidden = val!=='cartao';
      return;
    }
    const pickBank = e.target.closest('[data-action="pick-bank-for-pay"]');
    if(pickBank && payModalPayableId){
      payPayableViaBank(payModalPayableId, pickBank.dataset.id);
      closeModal(); renderTab(); toast('Conta paga e conta bancária debitada.');
      return;
    }
    const pickCard = e.target.closest('[data-action="pick-card-for-pay"]');
    if(pickCard && payModalPayableId){
      payPayableViaCard(payModalPayableId, pickCard.dataset.id);
      closeModal(); renderTab(); toast('Conta lançada na fatura do cartão.');
      return;
    }
  });

  // Nav lateral
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=> goToTab(btn.dataset.tab));
  });

  // Submits de formulários (delegado)
  document.addEventListener('submit', (e)=>{
    e.preventDefault();
    switch(e.target.id){
      case 'form-supplier': saveSupplierForm(e.target); break;
      case 'form-bank': saveBankForm(e.target); break;
      case 'form-bank-move': saveBankMoveForm(e.target); break;
      case 'form-payable': savePayableForm(e.target); break;
      case 'form-card': saveCardForm(e.target); break;
      case 'form-card-purchase': saveCardPurchaseForm(e.target); break;
      default: break;
    }
  });

  // Recalcular total ao vivo no formulário de contas a pagar
  document.addEventListener('input', (e)=>{
    if(e.target.classList && e.target.classList.contains('calc-field')) recalcPayablePreview();
  });

  // Filtros de relatórios
  document.addEventListener('change', (e)=>{
    if(e.target.id==='rf-supplier'){ reportFilters.supplier = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-card'){ reportFilters.card = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-status'){ reportFilters.status = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-from'){ reportFilters.from = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-to'){ reportFilters.to = e.target.value; refreshReportResults(); }
  });

  // Fechar modal clicando fora / botão X
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });

  // Exportar / importar / limpar
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', ()=> document.getElementById('file-import').click());
  document.getElementById('file-import').addEventListener('change', (e)=>{
    if(e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-reset').addEventListener('click', resetAllData);

  /* ---------------- Guardar payableId ao abrir modal "pagar" ---------------- */
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-action="pay-payable"]');
    if(el) payModalPayableId = el.dataset.id;
  });

  /* ---------------- Inicialização ---------------- */
  renderTab();

})();
