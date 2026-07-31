/* =========================================================
   RAZÃO — Gestão Financeira
   Aplicação 100% local: dados salvos no localStorage do
   navegador. Nenhuma chamada de rede é feita.

   Cada usuário cadastrado (tela de login) tem seus próprios
   dados, guardados sob uma chave separada no localStorage.
   Importante: como não existe servidor, isso separa os dados
   de cada pessoa dentro do app, mas não é uma segurança real
   contra alguém com acesso técnico ao navegador/arquivo.
========================================================= */
(function(){
  'use strict';

  /* ================================================================
     AUTENTICAÇÃO / MULTIUSUÁRIO
  ================================================================= */
  const USERS_KEY = 'razao_gf_users_v1';
  const SESSION_KEY = 'razao_gf_session_v1';
  const LEGACY_KEY = 'razao_gf_db_v1';

  function loadUsers(){
    try{ return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveUsers(list){
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
  }
  function dbKeyFor(username){
    return 'razao_gf_db_v1__' + username.toLowerCase();
  }
  async function hashPassword(pw){
    try{
      const enc = new TextEncoder().encode(pw);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){
      // alternativa simples caso a Web Crypto API não esteja disponível
      let h = 0;
      for(let i=0;i<pw.length;i++){ h = (h*31 + pw.charCodeAt(i)) | 0; }
      return 'fb_' + h;
    }
  }

  let currentUser = null;

  /* ================================================================
     ESTADO / ARMAZENAMENTO
  ================================================================= */
  function defaultDB(){
    return {
      suppliers: [], clients: [],
      bankAccounts: [], bankTransactions: [],
      creditCards: [], cardTransactions: [], cardSettlements: [],
      payables: [], receivables: [],
      appointments: []
    };
  }

  let db = defaultDB();

  function loadDBForCurrentUser(){
    if(!currentUser) return defaultDB();
    try{
      const raw = localStorage.getItem(dbKeyFor(currentUser));
      if(!raw) return defaultDB();
      return Object.assign(defaultDB(), JSON.parse(raw));
    }catch(e){
      console.error('Falha ao ler dados salvos, iniciando vazio.', e);
      return defaultDB();
    }
  }
  function saveDB(){
    if(!currentUser) return;
    localStorage.setItem(dbKeyFor(currentUser), JSON.stringify(db));
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
    el._timer = setTimeout(()=>{ el.hidden = true; }, 2800);
  }

  /* ---------------- Datas de parcelas ---------------- */
  function daysInMonth(year, monthIndex){ return new Date(year, monthIndex+1, 0).getDate(); }

  function addMonthsClamped(iso, months){
    const [y,m,d] = iso.split('-').map(Number);
    const total = (m-1) + months;
    const year = y + Math.floor(total/12);
    const monthIndex = ((total % 12) + 12) % 12;
    const day = Math.min(d, daysInMonth(year, monthIndex));
    return `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // Para o cartão: cada parcela cai automaticamente na fatura seguinte,
  // com base no dia de fechamento do cartão.
  function cardInstallmentDate(purchaseISO, closingDay, index){
    const [y,m,d] = purchaseISO.split('-').map(Number);
    let monthIndex = m-1;
    let year = y;
    const closing = closingDay ? Number(closingDay) : d;
    if(closingDay && d > Number(closingDay)) monthIndex += 1;
    monthIndex += index;
    year += Math.floor(monthIndex/12);
    monthIndex = ((monthIndex%12)+12)%12;
    const day = Math.min(closing, daysInMonth(year, monthIndex));
    return `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  /* ---------------- Datas da agenda (semana) ---------------- */
  function pad2(n){ return String(n).padStart(2,'0'); }
  function addDaysISO(iso, days){
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate()+days);
    return d.toISOString().slice(0,10);
  }
  function mondayOf(iso){
    const d = new Date(iso + 'T00:00:00');
    const day = d.getDay(); // 0=domingo ... 6=sábado
    const diff = (day===0) ? -6 : (1-day);
    return addDaysISO(iso, diff);
  }
  function weekDatesFrom(startISO){
    return Array.from({length:7}, (_,i)=> addDaysISO(startISO, i));
  }
  const WEEKDAY_LABELS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

  /* ================================================================
     CÁLCULOS
  ================================================================= */
  function bankAccountBalance(accountId){
    const acc = db.bankAccounts.find(a=>a.id===accountId);
    if(!acc) return 0;
    const moves = db.bankTransactions
      .filter(t=>t.bankAccountId===accountId)
      .reduce((s,t)=>s + Number(t.value||0), 0);
    return (Number(acc.initialBalance)||0) + moves;
  }
  function bankOverdraftLimit(accountId){
    const acc = db.bankAccounts.find(a=>a.id===accountId);
    return acc ? (Number(acc.overdraftLimit)||0) : 0;
  }
  function bankAvailable(accountId){
    return bankAccountBalance(accountId) + bankOverdraftLimit(accountId);
  }
  // true se aplicar "delta" (positivo ou negativo) ultrapassa o limite de cheque especial
  function wouldExceedOverdraft(accountId, delta){
    const limit = bankOverdraftLimit(accountId);
    const newBalance = bankAccountBalance(accountId) + delta;
    return newBalance < (-limit - 0.005);
  }
  function totalBankBalance(){
    return db.bankAccounts.reduce((s,a)=>s + bankAccountBalance(a.id), 0);
  }
  function payableTotal(p){
    return (Number(p.value)||0) + (Number(p.interest)||0) + (Number(p.penalty)||0);
  }
  function receivableTotal(r){
    return (Number(r.value)||0) + (Number(r.interest)||0) + (Number(r.penalty)||0);
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
  function totalReceivablesPending(){
    return db.receivables.filter(r=>r.status==='pendente').reduce((s,r)=>s + receivableTotal(r), 0);
  }
  function totalReceivablesReceived(){
    return db.receivables.filter(r=>r.status==='recebido').reduce((s,r)=>s + receivableTotal(r), 0);
  }
  function supplierName(id){ const s = db.suppliers.find(x=>x.id===id); return s ? s.name : '—'; }
  function clientName(id){ const c = db.clients.find(x=>x.id===id); return c ? c.name : '—'; }
  function bankAccountName(id){ const a = db.bankAccounts.find(x=>x.id===id); return a ? a.name : '—'; }
  function cardName(id){ const c = db.creditCards.find(x=>x.id===id); return c ? c.name : '—'; }

  /* ================================================================
     REGRAS DE NEGÓCIO
  ================================================================= */
  function payPayableViaBank(payableId, bankAccountId){
    const p = db.payables.find(x=>x.id===payableId);
    const acc = db.bankAccounts.find(a=>a.id===bankAccountId);
    if(!p || !acc) return false;
    const total = payableTotal(p);
    if(wouldExceedOverdraft(bankAccountId, -total)){
      toast('Saldo insuficiente: isso ultrapassaria o limite de cheque especial dessa conta.');
      return false;
    }
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
    return true;
  }

  function payPayableViaCard(payableId, cardId){
    const p = db.payables.find(x=>x.id===payableId);
    const card = db.creditCards.find(c=>c.id===cardId);
    if(!p || !card) return false;
    const total = payableTotal(p);
    const ctx = {
      id: uid('ctx'), cardId, date: todayISO(),
      description: p.description + ' (' + supplierName(p.supplierId) + ')',
      value: total, payableId: p.id, settled: false, settlementId: null,
      installmentGroupId: null, installmentIndex: 1, installmentCount: 1, createdAt: Date.now()
    };
    db.cardTransactions.push(ctx);
    Object.assign(p, {
      status: 'pago', paymentMethod: 'cartao', paymentDate: todayISO(),
      cardId, cardTransactionId: ctx.id, bankAccountId: null, bankTransactionId: null
    });
    saveDB();
    return true;
  }

  function reversePayablePayment(payableId){
    const p = db.payables.find(x=>x.id===payableId);
    if(!p) return false;
    if(p.paymentMethod === 'banco' && p.bankTransactionId){
      db.bankTransactions = db.bankTransactions.filter(t=>t.id!==p.bankTransactionId);
    }
    if(p.paymentMethod === 'cartao' && p.cardTransactionId){
      const ct = db.cardTransactions.find(t=>t.id===p.cardTransactionId);
      if(ct && ct.settled){ toast('Estorne a baixa da fatura do cartão antes de reverter esta conta.'); return false; }
      db.cardTransactions = db.cardTransactions.filter(t=>t.id!==p.cardTransactionId);
    }
    Object.assign(p, {
      status: 'pendente', paymentMethod: null, paymentDate: null,
      bankAccountId: null, bankTransactionId: null, cardId: null, cardTransactionId: null
    });
    saveDB();
    return true;
  }

  function receiveReceivableViaBank(receivableId, bankAccountId){
    const r = db.receivables.find(x=>x.id===receivableId);
    const acc = db.bankAccounts.find(a=>a.id===bankAccountId);
    if(!r || !acc) return false;
    const total = receivableTotal(r);
    const tx = {
      id: uid('btx'), bankAccountId, date: todayISO(),
      description: 'Recebimento: ' + r.description + ' (' + clientName(r.clientId) + ')',
      value: total, kind: 'receivable_receipt', refType: 'receivable', refId: r.id, createdAt: Date.now()
    };
    db.bankTransactions.push(tx);
    Object.assign(r, { status: 'recebido', receiptDate: todayISO(), bankAccountId, bankTransactionId: tx.id });
    saveDB();
    return true;
  }

  function reverseReceivableReceipt(receivableId){
    const r = db.receivables.find(x=>x.id===receivableId);
    if(!r) return false;
    if(r.bankTransactionId){
      const tx = db.bankTransactions.find(t=>t.id===r.bankTransactionId);
      if(tx && wouldExceedOverdraft(tx.bankAccountId, -tx.value)){
        toast('Não é possível estornar: o saldo ficaria abaixo do limite de cheque especial.');
        return false;
      }
      db.bankTransactions = db.bankTransactions.filter(t=>t.id!==r.bankTransactionId);
    }
    Object.assign(r, { status: 'pendente', receiptDate: null, bankAccountId: null, bankTransactionId: null });
    saveDB();
    return true;
  }

  function deleteBankTransaction(txId){
    const tx = db.bankTransactions.find(t=>t.id===txId);
    if(!tx) return false;
    if(tx.value > 0 && wouldExceedOverdraft(tx.bankAccountId, -tx.value)){
      toast('Não é possível excluir: o saldo ficaria abaixo do limite de cheque especial.');
      return false;
    }
    if(tx.refType === 'payable'){
      const p = db.payables.find(x=>x.id===tx.refId);
      if(p) Object.assign(p, { status:'pendente', paymentMethod:null, paymentDate:null, bankAccountId:null, bankTransactionId:null });
    }
    if(tx.refType === 'receivable'){
      const r = db.receivables.find(x=>x.id===tx.refId);
      if(r) Object.assign(r, { status:'pendente', receiptDate:null, bankAccountId:null, bankTransactionId:null });
    }
    if(tx.refType === 'card_settlement'){
      db.cardTransactions.forEach(ct=>{
        if(ct.settlementId === tx.refId){ ct.settled = false; ct.settlementId = null; }
      });
      db.cardSettlements = db.cardSettlements.filter(s=>s.id !== tx.refId);
    }
    db.bankTransactions = db.bankTransactions.filter(t=>t.id!==txId);
    saveDB();
    return true;
  }

  function deleteCardTransaction(txId){
    const tx = db.cardTransactions.find(t=>t.id===txId);
    if(!tx) return false;
    if(tx.settled){ toast('Este lançamento já foi quitado. Estorne a baixa da fatura primeiro.'); return false; }
    if(tx.payableId){
      const p = db.payables.find(x=>x.id===tx.payableId);
      if(p) Object.assign(p, { status:'pendente', paymentMethod:null, paymentDate:null, cardId:null, cardTransactionId:null });
    }
    db.cardTransactions = db.cardTransactions.filter(t=>t.id!==txId);
    saveDB();
    return true;
  }

  /* ---------------- Limpar dados do usuário atual ---------------- */
  function resetAllData(){
    if(!confirm('Isso vai apagar TODOS os seus dados (fornecedores, clientes, contas, cartões, contas a pagar e a receber) e não pode ser desfeito. Continuar?')) return;
    localStorage.removeItem(dbKeyFor(currentUser));
    db = defaultDB();
    selectedBankId = null;
    selectedCardId = null;
    saveDB();
    renderTab();
    toast('Todos os seus dados foram apagados.');
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
  function clientOptions(selected){
    if(!db.clients.length) return '<option value="">Nenhum cliente cadastrado</option>';
    return db.clients.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
  }
  function bankAccountOptions(selected){
    if(!db.bankAccounts.length) return '<option value="">Nenhuma conta cadastrada</option>';
    return db.bankAccounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)} — ${esc(a.bank||'')}</option>`).join('');
  }

  /* ================================================================
     PAINEL
  ================================================================= */
  function renderDashboard(){
    const pendentesPagar = db.payables.filter(p=>p.status==='pendente').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,6);
    const pendentesReceber = db.receivables.filter(r=>r.status==='pendente').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,6);
    const bancosRows = db.bankAccounts.slice(0,5).map(a=>{
      const bal = bankAccountBalance(a.id);
      return `<tr>
        <td>${esc(a.name)}</td>
        <td>${esc(a.bank||'—')}</td>
        <td class="num ${bal<0?'num-debit':'num-credit'}">${fmtMoney(bal)}</td>
      </tr>`;
    }).join('') || '<tr class="empty-row"><td colspan="3">Nenhuma conta bancária cadastrada ainda.</td></tr>';

    const vencRows = pendentesPagar.map(p=>`
      <tr>
        <td>${esc(supplierName(p.supplierId))}</td>
        <td>${esc(p.description)}</td>
        <td>${fmtDate(p.dueDate)}</td>
        <td class="num">${fmtMoney(payableTotal(p))}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Nenhuma conta pendente. Tudo em dia.</td></tr>';

    const recRows = pendentesReceber.map(r=>`
      <tr>
        <td>${esc(clientName(r.clientId))}</td>
        <td>${esc(r.description)}</td>
        <td>${fmtDate(r.dueDate)}</td>
        <td class="num">${fmtMoney(receivableTotal(r))}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Nada a receber pendente no momento.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Total a pagar</span><strong style="color:var(--debit)">${fmtMoney(totalPayablesPending())}</strong></div>
        <div class="summary-box"><span>Total a receber</span><strong style="color:var(--credit)">${fmtMoney(totalReceivablesPending())}</strong></div>
        <div class="summary-box"><span>Saldo em contas</span><strong>${fmtMoney(totalBankBalance())}</strong></div>
        <div class="summary-box"><span>Faturas de cartão em aberto</span><strong style="color:var(--debit)">${fmtMoney(totalOpenCards())}</strong></div>
      </div>

      <div class="breakdown-grid">
        <div class="panel">
          <div class="panel-head"><h2>Próximos vencimentos</h2><span class="panel-sub">a pagar</span></div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Fornecedor</th><th>Descrição</th><th>Vencimento</th><th class="num">Total</th></tr></thead>
            <tbody>${vencRows}</tbody>
          </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Próximos recebimentos</h2><span class="panel-sub">a receber</span></div>
          <div style="overflow-x:auto">
          <table class="ledger">
            <thead><tr><th>Cliente</th><th>Descrição</th><th>Vencimento</th><th class="num">Total</th></tr></thead>
            <tbody>${recRows}</tbody>
          </table>
          </div>
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
    `;
  }

  /* ================================================================
     FORNECEDORES  (só aparecem em Contas a Pagar)
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
          <div><h2>Fornecedores de produtos e serviços</h2><p class="panel-sub">Cadastre quem você paga. Fornecedores só aparecem em Contas a Pagar.</p></div>
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
      Object.assign(db.suppliers.find(x=>x.id===editId), data);
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
     CLIENTES  (só aparecem em Contas a Receber)
  ================================================================= */
  function renderClients(){
    const rows = db.clients.map(c=>`
      <tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.type||'—')}</td>
        <td>${esc(c.document||'—')}</td>
        <td>${esc(c.phone||'—')}<br><span style="color:var(--ink-soft);font-size:11.5px">${esc(c.email||'')}</span></td>
        <td class="actions">
          <button class="link-btn" data-action="edit-client" data-id="${c.id}">Editar</button>
          <button class="link-btn danger" data-action="delete-client" data-id="${c.id}">Excluir</button>
        </td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="5">Nenhum cliente cadastrado. Clique em "Novo cliente" para começar.</td></tr>';

    return `
      <div class="panel">
        <div class="panel-head">
          <div><h2>Clientes</h2><p class="panel-sub">Cadastre quem paga você. Clientes só aparecem em Contas a Receber.</p></div>
          <button class="btn" data-action="add-client">+ Novo cliente</button>
        </div>
        <table class="ledger">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Documento</th><th>Contato</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function clientFormHTML(existing){
    const e = existing || {};
    return `
      <h2>${existing ? 'Editar cliente' : 'Novo cliente'}</h2>
      <p class="modal-sub">Dados de quem paga você.</p>
      <form id="form-client" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Nome / Razão social</label>
            <input type="text" id="f-name" value="${esc(e.name||'')}" required autofocus>
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="f-type">
              <option ${e.type==='Pessoa Física'?'selected':''}>Pessoa Física</option>
              <option ${e.type==='Pessoa Jurídica'?'selected':''}>Pessoa Jurídica</option>
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
          <button type="submit" class="btn">Salvar cliente</button>
        </div>
      </form>
    `;
  }

  function saveClientForm(form){
    const editId = form.dataset.editId;
    const data = {
      name: document.getElementById('f-name').value.trim(),
      type: document.getElementById('f-type').value,
      document: document.getElementById('f-document').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      notes: document.getElementById('f-notes').value.trim()
    };
    if(!data.name){ toast('Informe o nome do cliente.'); return; }
    if(editId){
      Object.assign(db.clients.find(x=>x.id===editId), data);
      toast('Cliente atualizado.');
    }else{
      db.clients.push(Object.assign({ id: uid('cli'), createdAt: Date.now() }, data));
      toast('Cliente cadastrado.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deleteClient(id){
    const inUse = db.receivables.some(r=>r.clientId===id) || db.appointments.some(a=>a.clientId===id);
    if(inUse){
      alert('Este cliente possui contas a receber e/ou agendamentos vinculados. Exclua ou reatribua essas contas/agendamentos antes de remover o cliente.');
      return;
    }
    if(!confirm('Excluir este cliente?')) return;
    db.clients = db.clients.filter(c=>c.id!==id);
    saveDB();
    renderTab();
    toast('Cliente excluído.');
  }

  /* ================================================================
     CONTAS BANCÁRIAS
  ================================================================= */
  let selectedBankId = null;

  function renderBanks(){
    const cards = db.bankAccounts.map(a=>{
      const bal = bankAccountBalance(a.id);
      const limit = bankOverdraftLimit(a.id);
      return `
      <div class="entity-card ${selectedBankId===a.id?'is-selected':''}" data-action="select-bank" data-id="${a.id}">
        <div class="entity-card-head">
          <div><h3>${esc(a.name)}</h3><span>${esc(a.bank||'')}${a.agency?(' · ag. '+esc(a.agency)):''}${a.number?(' · cc '+esc(a.number)):''}</span></div>
        </div>
        <div class="balance ${bal<0?'neg':'pos'}">${fmtMoney(bal)}</div>
        ${limit>0 ? `<div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">Cheque especial: ${fmtMoney(limit)}${bal<0?' · em uso: '+fmtMoney(Math.min(-bal,limit)):''}</div>` : ''}
        <div class="entity-card-foot">
          <button class="btn small" data-action="bank-move" data-id="${a.id}">Movimentar</button>
          <button class="btn small secondary" data-action="bank-pay-debt" data-id="${a.id}">Pagar conta a pagar</button>
          <button class="btn small secondary" data-action="bank-receive-debt" data-id="${a.id}">Receber conta a receber</button>
          <button class="btn small secondary" data-action="edit-bank" data-id="${a.id}">Editar</button>
          <button class="btn small danger" data-action="delete-bank" data-id="${a.id}">Excluir</button>
        </div>
      </div>`;
    }).join('') || '';

    let detail = '';
    if(selectedBankId && db.bankAccounts.some(a=>a.id===selectedBankId)){
      const acc = db.bankAccounts.find(a=>a.id===selectedBankId);
      const limit = bankOverdraftLimit(acc.id);
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
            <span class="panel-sub">Saldo inicial: ${fmtMoney(acc.initialBalance)} · Saldo atual: <strong class="mono">${fmtMoney(bankAccountBalance(acc.id))}</strong>${limit>0 ? ' · Disponível com limite: <strong class="mono">'+fmtMoney(bankAvailable(acc.id))+'</strong>' : ''}</span>
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
        <div><h2 style="font-family:var(--font-display)">Contas bancárias</h2><p class="panel-sub">Cadastre suas contas, lance entradas/saídas e vincule pagamentos e recebimentos.</p></div>
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
          <div class="field">
            <label>Limite de cheque especial</label>
            <input type="number" step="0.01" min="0" class="mono-input" id="f-overdraft" value="${e.overdraftLimit!==undefined?e.overdraftLimit:0}">
            <span class="field-hint">A conta pode ficar negativa até esse valor.</span>
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
      initialBalance: parseFloat(document.getElementById('f-initial').value) || 0,
      overdraftLimit: Math.max(0, parseFloat(document.getElementById('f-overdraft').value) || 0)
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
    toast('Conta excluído.');
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
    if(tipo==='saida' && wouldExceedOverdraft(accountId, -Math.abs(valor))){
      toast('Isso ultrapassa o limite de cheque especial desta conta (limite: ' + fmtMoney(bankOverdraftLimit(accountId)) + ').');
      return;
    }
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

  function bankReceiveDebtFormHTML(accountId){
    const pend = db.receivables.filter(r=>r.status==='pendente').sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    const list = pend.map(r=>`
      <div class="option-row" data-action="pick-receivable-for-bank" data-id="${r.id}">
        <div>
          <div class="o-title">${esc(clientName(r.clientId))}</div>
          <div class="o-sub">${esc(r.description)} · vence ${fmtDate(r.dueDate)}</div>
        </div>
        <div class="o-val">${fmtMoney(receivableTotal(r))}</div>
      </div>`).join('') || '<div class="empty-state"><p>Nenhuma conta a receber pendente.</p></div>';

    return `
      <h2>Receber conta a receber</h2>
      <p class="modal-sub">Depositando em <strong>${esc(bankAccountName(accountId))}</strong> (saldo atual: ${fmtMoney(bankAccountBalance(accountId))}). Selecione o que foi recebido:</p>
      <div class="option-list" data-account-id="${accountId}">${list}</div>
      <div class="form-actions">
        <button type="button" class="btn secondary" data-action="close-modal">Fechar</button>
      </div>
    `;
  }

  /* ================================================================
     PARCELAMENTO — helper compartilhado (contas a pagar/receber)
  ================================================================= */
  function installmentDatesHTML(n, baseDate){
    let rows = '';
    for(let i=0;i<n;i++){
      rows += `<div class="installment-row"><span>${i+1}/${n}</span><input type="date" class="inst-date" data-idx="${i}" value="${addMonthsClamped(baseDate||todayISO(), i)}"></div>`;
    }
    return rows;
  }

  function renderInstallmentDates(){
    const parcelasEl = document.getElementById('f-parcelas');
    const container = document.getElementById('installment-dates');
    if(!parcelasEl || !container) return;
    const n = Math.max(1, parseInt(parcelasEl.value)||1);
    const dueEl = document.getElementById('f-vencimento');
    const jurosEl = document.getElementById('f-juros');
    const multaEl = document.getElementById('f-multa');
    if(n<=1){
      container.innerHTML = '';
      if(jurosEl){ jurosEl.disabled = false; }
      if(multaEl){ multaEl.disabled = false; }
      return;
    }
    container.innerHTML = installmentDatesHTML(n, dueEl ? dueEl.value : todayISO());
    if(jurosEl){ jurosEl.disabled = true; jurosEl.value = ''; }
    if(multaEl){ multaEl.disabled = true; multaEl.value = ''; }
    if(document.getElementById('payable-total-preview')) recalcPayablePreview();
    if(document.getElementById('receivable-total-preview')) recalcReceivablePreview();
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
      const parcelaTag = (p.installmentCount>1) ? `<br><span style="font-size:11px;color:var(--ink-soft)">Parcela ${p.installmentIndex}/${p.installmentCount}</span>` : '';
      return `
      <tr>
        <td>${esc(supplierName(p.supplierId))}</td>
        <td>${esc(p.description)}${parcelaTag}</td>
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
          <div><h2>Contas a pagar</h2><p class="panel-sub">Juros e multa somam ao total automaticamente quando preenchidos. Pode parcelar ao criar.</p></div>
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
            <label>Data de vencimento${existing?'':' (1ª parcela)'}</label>
            <input type="date" id="f-vencimento" value="${e.dueDate||todayISO()}" required>
          </div>
          ${existing ? '' : `
          <div class="field">
            <label>Parcelas</label>
            <input type="number" min="1" max="60" id="f-parcelas" value="1">
            <span class="field-hint">Juros/multa não se aplicam ao parcelar — ajuste em uma parcela específica depois, se necessário.</span>
          </div>
          <div class="field full installment-list" id="installment-dates"></div>
          `}
        </div>
        <div class="total-line">
          <span>Total da dívida${existing?'':' (1ª parcela, se parcelado)'}</span>
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
    const parcelasEl = document.getElementById('f-parcelas');
    const n = parcelasEl ? Math.max(1, parseInt(parcelasEl.value)||1) : 1;
    const el = document.getElementById('payable-total-preview');
    if(el) el.textContent = fmtMoney(n>1 ? (v/n) : (v+j+m));
  }

  function savePayableForm(form){
    const editId = form.dataset.editId;
    const supplierId = document.getElementById('f-supplier').value;
    const description = document.getElementById('f-desc').value.trim();
    const value = parseFloat(document.getElementById('f-valor').value) || 0;
    const interest = parseFloat(document.getElementById('f-juros').value) || 0;
    const penalty = parseFloat(document.getElementById('f-multa').value) || 0;
    const issueDate = document.getElementById('f-emissao').value;
    const dueDate = document.getElementById('f-vencimento').value;
    if(!supplierId){ toast('Selecione um fornecedor.'); return; }
    if(!description){ toast('Informe a descrição.'); return; }

    if(editId){
      Object.assign(db.payables.find(p=>p.id===editId), { supplierId, description, value, interest, penalty, issueDate, dueDate });
      toast('Conta a pagar atualizada.');
      saveDB(); closeModal(); renderTab();
      return;
    }

    const parcelasEl = document.getElementById('f-parcelas');
    const parcelas = parcelasEl ? Math.max(1, parseInt(parcelasEl.value)||1) : 1;

    if(parcelas<=1){
      db.payables.push({
        id: uid('pay'), supplierId, description, value, interest, penalty, issueDate, dueDate,
        status:'pendente', paymentMethod:null, paymentDate:null,
        bankAccountId:null, bankTransactionId:null, cardId:null, cardTransactionId:null,
        installmentGroupId:null, installmentIndex:1, installmentCount:1, createdAt: Date.now()
      });
      toast('Conta a pagar cadastrada.');
    }else{
      const dateInputs = document.querySelectorAll('#installment-dates .inst-date');
      if(dateInputs.length !== parcelas){ toast('Ajuste o número de parcelas para gerar as datas antes de salvar.'); return; }
      const groupId = uid('grp');
      const baseValue = Math.round((value/parcelas)*100)/100;
      let acumulado = 0;
      dateInputs.forEach((input, i)=>{
        let v = baseValue;
        if(i===parcelas-1) v = Math.round((value-acumulado)*100)/100;
        acumulado += v;
        db.payables.push({
          id: uid('pay'), supplierId,
          description: description + ' (parcela ' + (i+1) + '/' + parcelas + ')',
          value: v, interest: 0, penalty: 0,
          issueDate, dueDate: input.value || dueDate,
          status:'pendente', paymentMethod:null, paymentDate:null,
          bankAccountId:null, bankTransactionId:null, cardId:null, cardTransactionId:null,
          installmentGroupId: groupId, installmentIndex: i+1, installmentCount: parcelas, createdAt: Date.now()
        });
      });
      toast('Conta a pagar parcelada em ' + parcelas + ' vezes.');
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
     CONTAS A RECEBER
  ================================================================= */
  function renderReceivables(){
    const sorted = db.receivables.slice().sort((a,b)=> (a.status===b.status?0:(a.status==='pendente'?-1:1)) || a.dueDate.localeCompare(b.dueDate));
    const rows = sorted.map(r=>{
      const total = receivableTotal(r);
      const vencida = r.status==='pendente' && r.dueDate < todayISO();
      const receivedVia = r.status==='recebido' ? ('Conta: '+bankAccountName(r.bankAccountId)) : '—';
      const parcelaTag = (r.installmentCount>1) ? `<br><span style="font-size:11px;color:var(--ink-soft)">Parcela ${r.installmentIndex}/${r.installmentCount}</span>` : '';
      return `
      <tr>
        <td>${esc(clientName(r.clientId))}</td>
        <td>${esc(r.description)}${parcelaTag}</td>
        <td>${fmtDate(r.issueDate)}</td>
        <td>${fmtDate(r.dueDate)}${vencida?' <span class="badge aberto">vencida</span>':''}</td>
        <td class="num">${fmtMoney(r.value)}</td>
        <td class="num">${r.interest ? fmtMoney(r.interest) : '—'}</td>
        <td class="num">${r.penalty ? fmtMoney(r.penalty) : '—'}</td>
        <td class="num"><strong>${fmtMoney(total)}</strong></td>
        <td><span class="badge ${r.status==='recebido'?'pago':'pendente'}">${r.status==='recebido'?'Recebido':'Pendente'}</span><br><span style="font-size:11px;color:var(--ink-soft)">${receivedVia}</span></td>
        <td class="actions">
          ${r.status==='pendente' ? `<button class="link-btn" data-action="receive-receivable" data-id="${r.id}">Receber</button>` : `<button class="link-btn" data-action="reverse-receivable" data-id="${r.id}">Estornar</button>`}
          <button class="link-btn" data-action="edit-receivable" data-id="${r.id}">Editar</button>
          <button class="link-btn danger" data-action="delete-receivable" data-id="${r.id}">Excluir</button>
        </td>
      </tr>`;
    }).join('') || '<tr class="empty-row"><td colspan="10">Nenhuma conta a receber cadastrada.</td></tr>';

    return `
      <div class="panel">
        <div class="panel-head">
          <div><h2>Contas a receber</h2><p class="panel-sub">Juros e multa somam ao total automaticamente quando preenchidos. Pode parcelar ao criar.</p></div>
          <button class="btn" data-action="add-receivable">+ Nova conta a receber</button>
        </div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr>
            <th>Cliente</th><th>Descrição</th><th>Emissão</th><th>Vencimento</th>
            <th class="num">Valor</th><th class="num">Juros</th><th class="num">Multa</th><th class="num">Total</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  function receivableFormHTML(existing){
    if(!db.clients.length){
      return `
        <h2>Nova conta a receber</h2>
        <div class="empty-state">
          <h3>Cadastre um cliente primeiro</h3>
          <p>Toda conta a receber precisa estar vinculada a um cliente.</p>
          <button class="btn" data-action="goto-clientes-from-modal">Ir para Clientes</button>
        </div>`;
    }
    const e = existing || {};
    const total = existing ? receivableTotal(e) : 0;
    return `
      <h2>${existing ? 'Editar conta a receber' : 'Nova conta a receber'}</h2>
      <form id="form-receivable" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Cliente</label>
            <select id="f-client" required>${clientOptions(e.clientId)}</select>
          </div>
          <div class="field full">
            <label>Descrição</label>
            <input type="text" id="f-desc" value="${esc(e.description||'')}" required>
          </div>
          <div class="field">
            <label>Valor original</label>
            <input type="number" step="0.01" class="mono-input calc-field-r" id="f-valor" value="${e.value!==undefined?e.value:''}" required>
          </div>
          <div class="field">
            <label>Juros</label>
            <input type="number" step="0.01" class="mono-input calc-field-r" id="f-juros" value="${e.interest||''}" placeholder="0,00">
          </div>
          <div class="field">
            <label>Multa</label>
            <input type="number" step="0.01" class="mono-input calc-field-r" id="f-multa" value="${e.penalty||''}" placeholder="0,00">
          </div>
          <div class="field">
            <label>Data de emissão</label>
            <input type="date" id="f-emissao" value="${e.issueDate||todayISO()}" required>
          </div>
          <div class="field">
            <label>Data de vencimento${existing?'':' (1ª parcela)'}</label>
            <input type="date" id="f-vencimento" value="${e.dueDate||todayISO()}" required>
          </div>
          ${existing ? '' : `
          <div class="field">
            <label>Parcelas</label>
            <input type="number" min="1" max="60" id="f-parcelas" value="1">
            <span class="field-hint">Juros/multa não se aplicam ao parcelar — ajuste em uma parcela específica depois, se necessário.</span>
          </div>
          <div class="field full installment-list" id="installment-dates"></div>
          `}
        </div>
        <div class="total-line">
          <span>Total a receber${existing?'':' (1ª parcela, se parcelado)'}</span>
          <strong id="receivable-total-preview">${fmtMoney(total)}</strong>
        </div>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar conta a receber</button>
        </div>
      </form>
    `;
  }

  function recalcReceivablePreview(){
    const v = parseFloat(document.getElementById('f-valor')?.value) || 0;
    const j = parseFloat(document.getElementById('f-juros')?.value) || 0;
    const m = parseFloat(document.getElementById('f-multa')?.value) || 0;
    const parcelasEl = document.getElementById('f-parcelas');
    const n = parcelasEl ? Math.max(1, parseInt(parcelasEl.value)||1) : 1;
    const el = document.getElementById('receivable-total-preview');
    if(el) el.textContent = fmtMoney(n>1 ? (v/n) : (v+j+m));
  }

  function saveReceivableForm(form){
    const editId = form.dataset.editId;
    const clientId = document.getElementById('f-client').value;
    const description = document.getElementById('f-desc').value.trim();
    const value = parseFloat(document.getElementById('f-valor').value) || 0;
    const interest = parseFloat(document.getElementById('f-juros').value) || 0;
    const penalty = parseFloat(document.getElementById('f-multa').value) || 0;
    const issueDate = document.getElementById('f-emissao').value;
    const dueDate = document.getElementById('f-vencimento').value;
    if(!clientId){ toast('Selecione um cliente.'); return; }
    if(!description){ toast('Informe a descrição.'); return; }

    if(editId){
      Object.assign(db.receivables.find(r=>r.id===editId), { clientId, description, value, interest, penalty, issueDate, dueDate });
      toast('Conta a receber atualizada.');
      saveDB(); closeModal(); renderTab();
      return;
    }

    const parcelasEl = document.getElementById('f-parcelas');
    const parcelas = parcelasEl ? Math.max(1, parseInt(parcelasEl.value)||1) : 1;

    if(parcelas<=1){
      db.receivables.push({
        id: uid('rec'), clientId, description, value, interest, penalty, issueDate, dueDate,
        status:'pendente', receiptDate:null, bankAccountId:null, bankTransactionId:null,
        installmentGroupId:null, installmentIndex:1, installmentCount:1, createdAt: Date.now()
      });
      toast('Conta a receber cadastrada.');
    }else{
      const dateInputs = document.querySelectorAll('#installment-dates .inst-date');
      if(dateInputs.length !== parcelas){ toast('Ajuste o número de parcelas para gerar as datas antes de salvar.'); return; }
      const groupId = uid('grp');
      const baseValue = Math.round((value/parcelas)*100)/100;
      let acumulado = 0;
      dateInputs.forEach((input, i)=>{
        let v = baseValue;
        if(i===parcelas-1) v = Math.round((value-acumulado)*100)/100;
        acumulado += v;
        db.receivables.push({
          id: uid('rec'), clientId,
          description: description + ' (parcela ' + (i+1) + '/' + parcelas + ')',
          value: v, interest: 0, penalty: 0,
          issueDate, dueDate: input.value || dueDate,
          status:'pendente', receiptDate:null, bankAccountId:null, bankTransactionId:null,
          installmentGroupId: groupId, installmentIndex: i+1, installmentCount: parcelas, createdAt: Date.now()
        });
      });
      toast('Conta a receber parcelada em ' + parcelas + ' vezes.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function deleteReceivable(id){
    const r = db.receivables.find(x=>x.id===id);
    if(!r) return;
    if(r.status==='recebido'){
      alert('Esta conta já foi recebida. Estorne o recebimento antes de excluí-la.');
      return;
    }
    if(!confirm('Excluir esta conta a receber?')) return;
    db.receivables = db.receivables.filter(x=>x.id!==id);
    saveDB();
    renderTab();
    toast('Conta a receber excluída.');
  }

  function receiveReceivableFormHTML(receivableId){
    const r = db.receivables.find(x=>x.id===receivableId);
    if(!r) return '';
    const total = receivableTotal(r);
    const bankList = db.bankAccounts.map(a=>`
      <div class="option-row" data-action="pick-bank-for-receive" data-id="${a.id}">
        <div><div class="o-title">${esc(a.name)}</div><div class="o-sub">${esc(a.bank||'')}</div></div>
        <div class="o-val">${fmtMoney(bankAccountBalance(a.id))}</div>
      </div>`).join('') || '<div class="empty-state"><p>Nenhuma conta bancária cadastrada.</p></div>';

    return `
      <h2>Receber conta a receber</h2>
      <p class="modal-sub">${esc(r.description)} — ${esc(clientName(r.clientId))} · total <strong>${fmtMoney(total)}</strong></p>
      <div class="option-list">${bankList}</div>
      <div class="form-actions">
        <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
      </div>
    `;
  }

  /* ================================================================
     AGENDA
  ================================================================= */
  let agendaWeekStart = mondayOf(todayISO());

  function renderAgenda(){
    const days = weekDatesFrom(agendaWeekStart);
    const weekAppointments = db.appointments.filter(a=>days.includes(a.date));

    const defaultHours = Array.from({length:14}, (_,i)=> i+7); // 07h às 20h
    const usedHours = weekAppointments.map(a=> parseInt(a.time.split(':')[0],10));
    const allHours = Array.from(new Set([...defaultHours, ...usedHours])).sort((x,y)=>x-y);

    const defaultDate = days.includes(todayISO()) ? todayISO() : agendaWeekStart;

    const headerCells = days.map((d,i)=>{
      const isToday = d===todayISO();
      return `<div class="agenda-day-header ${isToday?'is-today':''}">${WEEKDAY_LABELS[i]}<br><span>${fmtDate(d)}</span></div>`;
    }).join('');

    const rows = allHours.map(h=>{
      const label = `<div class="agenda-hour-label">${pad2(h)}:00</div>`;
      const cells = days.map(d=>{
        const items = weekAppointments.filter(a=> a.date===d && parseInt(a.time.split(':')[0],10)===h).sort((a,b)=>a.time.localeCompare(b.time));
        const chips = items.map(a=>`
          <div class="agenda-chip ${a.status==='confirmado'?'is-confirmed':''}">
            <button type="button" class="agenda-chip-main" data-action="edit-appointment" data-id="${a.id}">
              <span class="agenda-chip-time">${a.time} - ${a.endTime || '--:--'}</span>
              <span class="agenda-chip-name">${esc(clientName(a.clientId))}</span>
            </button>
            <div class="agenda-chip-actions">
              ${a.status==='agendado'
                ? `<button type="button" data-action="confirm-appointment" data-id="${a.id}" title="Confirmar presença">&check;</button>`
                : `<button type="button" class="agenda-chip-badge" data-action="unconfirm-appointment" data-id="${a.id}" title="Desfazer confirmação">presente ↺</button>`}
              <button type="button" data-action="delete-appointment" data-id="${a.id}" title="Excluir">&times;</button>
            </div>
          </div>`).join('');
        return `<div class="agenda-cell">${chips}<button type="button" class="agenda-add-btn" data-action="schedule-appointment" data-date="${d}" data-hour="${h}" title="Agendar neste horário">+</button></div>`;
      }).join('');
      return label + cells;
    }).join('');

    return `
      <div class="panel">
        <div class="panel-head">
          <div><h2>Agenda semanal</h2><p class="panel-sub">${fmtDate(days[0])} – ${fmtDate(days[6])} · pode agendar mais de um cliente no mesmo horário</p></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn secondary small" data-action="agenda-prev-week">◀ Semana anterior</button>
            <button class="btn secondary small" data-action="agenda-today">Hoje</button>
            <button class="btn secondary small" data-action="agenda-next-week">Próxima semana ▶</button>
            <button class="btn" data-action="schedule-appointment" data-date="${defaultDate}">+ Novo agendamento</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <div class="agenda-grid" style="grid-template-columns: 64px repeat(7, minmax(112px,1fr)); min-width:760px;">
            <div class="agenda-corner"></div>
            ${headerCells}
            ${rows}
          </div>
        </div>
      </div>
    `;
  }

  function appointmentFormHTML(existing, presetDate, presetHour){
    if(!db.clients.length){
      return `
        <h2>Novo agendamento</h2>
        <div class="empty-state">
          <h3>Cadastre um cliente primeiro</h3>
          <p>Todo agendamento precisa estar vinculado a um cliente.</p>
          <button class="btn" data-action="goto-clientes-from-modal">Ir para Clientes</button>
        </div>`;
    }
    const e = existing || {};
    const date = e.date || presetDate || todayISO();
    const hasPresetHour = presetHour!==undefined && presetHour!==null && presetHour!=='';
    const time = e.time || (hasPresetHour ? pad2(parseInt(presetHour,10))+':00' : '');
    
    // Calcula a hora final sugerida (Início + 1 hora)
    let defaultEndTime = '';
    if(time){
      const [h, m] = time.split(':');
      defaultEndTime = pad2((parseInt(h,10) + 1) % 24) + ':' + m;
    }
    const endTime = e.endTime || defaultEndTime;

    return `
      <h2>${existing ? 'Editar agendamento' : 'Novo agendamento'}</h2>
      <form id="form-appointment" data-edit-id="${existing ? e.id : ''}">
        <div class="form-grid">
          <div class="field full">
            <label>Cliente</label>
            <select id="f-client" required>${clientOptions(e.clientId)}</select>
          </div>
          <div class="field full">
            <label>Data</label>
            <input type="date" id="f-date" value="${date}" required>
          </div>
          <div class="field">
            <label>Hora Início</label>
            <input type="time" id="f-time" value="${time}" required>
          </div>
          <div class="field">
            <label>Hora Fim</label>
            <input type="time" id="f-endtime" value="${endTime}" required>
          </div>
          <div class="field full">
            <label>Observações</label>
            <textarea id="f-notes">${esc(e.notes||'')}</textarea>
          </div>
        </div>
        <div class="form-actions">
          ${existing ? `<button type="button" class="link-btn danger" style="margin-right:auto" data-action="delete-appointment" data-id="${e.id}">Excluir</button>` : ''}
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Salvar agendamento</button>
        </div>
      </form>
    `;
  }

  function saveAppointmentForm(form){
    const editId = form.dataset.editId;
    const clientId = document.getElementById('f-client').value;
    const date = document.getElementById('f-date').value;
    const time = document.getElementById('f-time').value;
    const endTime = document.getElementById('f-endtime').value;
    const notes = document.getElementById('f-notes').value.trim();
    
    if(!clientId){ toast('Selecione um cliente.'); return; }
    if(!date || !time || !endTime){ toast('Informe data, horário de início e de fim.'); return; }
    if(time >= endTime) { toast('A hora final deve ser maior que a inicial.'); return; }

    if(editId){
      Object.assign(db.appointments.find(a=>a.id===editId), { clientId, date, time, endTime, notes });
      toast('Agendamento atualizado.');
    }else{
      db.appointments.push({ id: uid('apt'), clientId, date, time, endTime, notes, status:'agendado', confirmedAt:null, createdAt: Date.now() });
      toast('Agendamento criado.');
    }
    saveDB();
    closeModal();
    renderTab();
  }

  function confirmAppointmentPresence(id){
    const a = db.appointments.find(x=>x.id===id);
    if(!a) return;
    a.status = 'confirmado';
    a.confirmedAt = todayISO();
    saveDB();
    renderTab();
    toast('Presença confirmada.');
  }

  function unconfirmAppointment(id){
    const a = db.appointments.find(x=>x.id===id);
    if(!a) return;
    a.status = 'agendado';
    a.confirmedAt = null;
    saveDB();
    renderTab();
    toast('Confirmação desfeita.');
  }

  function deleteAppointment(id){
    if(!confirm('Excluir este agendamento?')) return;
    db.appointments = db.appointments.filter(a=>a.id!==id);
    saveDB();
    closeModal();
    renderTab();
    toast('Agendamento excluído.');
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
            <thead><tr><th>Fatura</th><th>Descrição</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          </div>
        </div>`;
    }

    return `
      <div class="panel-head" style="margin-bottom:16px;">
        <div><h2 style="font-family:var(--font-display)">Cartões de crédito</h2></div>
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
            <label>Valor total</label>
            <input type="number" step="0.01" class="mono-input" id="f-valor" required>
          </div>
          <div class="field">
            <label>Parcelas</label>
            <input type="number" min="1" max="36" id="f-parcelas" value="1">
          </div>
          <div class="field">
            <label>Data da compra</label>
            <input type="date" id="f-data" value="${todayISO()}" required>
          </div>
          <div class="field full">
            <label>Descrição</label>
            <input type="text" id="f-desc" placeholder="Ex.: Compra de suprimentos" required>
          </div>
        </div>
        <span class="field-hint">Parcelado, cada valor é lançado automaticamente na fatura correspondente, conforme o dia de fechamento do cartão.</span>
        <div class="form-actions">
          <button type="button" class="btn secondary" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn">Lançar compra</button>
        </div>
      </form>
    `;
  }

  function saveCardPurchaseForm(form){
    const cardId = form.dataset.cardId;
    const card = db.creditCards.find(c=>c.id===cardId);
    const valorTotal = parseFloat(document.getElementById('f-valor').value);
    const parcelas = Math.max(1, parseInt(document.getElementById('f-parcelas').value)||1);
    const dataCompra = document.getElementById('f-data').value || todayISO();
    const descBase = document.getElementById('f-desc').value.trim() || 'Lançamento no cartão';
    if(!valorTotal || valorTotal<=0){ toast('Informe um valor válido.'); return; }

    const groupId = parcelas>1 ? uid('grp') : null;
    const baseValue = Math.round((valorTotal/parcelas)*100)/100;
    let acumulado = 0;
    for(let i=0;i<parcelas;i++){
      let valorParcela = baseValue;
      if(i === parcelas-1) valorParcela = Math.round((valorTotal-acumulado)*100)/100;
      acumulado += valorParcela;
      const dueDate = parcelas>1 ? cardInstallmentDate(dataCompra, card ? card.closingDay : null, i) : dataCompra;
      db.cardTransactions.push({
        id: uid('ctx'), cardId, date: dueDate,
        description: descBase + (parcelas>1 ? ` (parcela ${i+1}/${parcelas})` : ''),
        value: valorParcela, payableId: null, settled:false, settlementId:null,
        installmentGroupId: groupId, installmentIndex: i+1, installmentCount: parcelas, createdAt: Date.now()
      });
    }
    saveDB();
    closeModal();
    renderTab();
    toast(parcelas>1 ? 'Compra parcelada em ' + parcelas + ' faturas.' : 'Lançamento adicionado ao cartão.');
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
    if(wouldExceedOverdraft(card.bankAccountId, -total)){
      toast('Saldo insuficiente: isso ultrapassaria o limite de cheque especial da conta vinculada.');
      return;
    }
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
  let reportMode = 'pagar';
  let reportFiltersPagar = { supplier:'all', card:'all', status:'all', from:'', to:'' };
  let reportFiltersReceber = { client:'all', status:'all', from:'', to:'' };
  let reportFiltersFreq = { client:'all', from:'', to:'' };
  let reportFiltersAgenda = { client:'all', status:'all', from:'', to:'' };

  function filteredPayables(){
    return db.payables.filter(p=>{
      if(reportFiltersPagar.supplier!=='all' && p.supplierId!==reportFiltersPagar.supplier) return false;
      if(reportFiltersPagar.card==='none' && p.cardId) return false;
      if(reportFiltersPagar.card!=='all' && reportFiltersPagar.card!=='none' && p.cardId!==reportFiltersPagar.card) return false;
      if(reportFiltersPagar.status!=='all' && p.status!==reportFiltersPagar.status) return false;
      if(reportFiltersPagar.from && p.dueDate < reportFiltersPagar.from) return false;
      if(reportFiltersPagar.to && p.dueDate > reportFiltersPagar.to) return false;
      return true;
    });
  }
  function filteredReceivables(){
    return db.receivables.filter(r=>{
      if(reportFiltersReceber.client!=='all' && r.clientId!==reportFiltersReceber.client) return false;
      if(reportFiltersReceber.status!=='all' && r.status!==reportFiltersReceber.status) return false;
      if(reportFiltersReceber.from && r.dueDate < reportFiltersReceber.from) return false;
      if(reportFiltersReceber.to && r.dueDate > reportFiltersReceber.to) return false;
      return true;
    });
  }
  function filteredAppointmentsFreq(){
    return db.appointments.filter(a=>{
      if(reportFiltersFreq.client!=='all' && a.clientId!==reportFiltersFreq.client) return false;
      if(reportFiltersFreq.from && a.date < reportFiltersFreq.from) return false;
      if(reportFiltersFreq.to && a.date > reportFiltersFreq.to) return false;
      return true;
    });
  }
  function filteredAppointmentsList(){
    return db.appointments.filter(a=>{
      if(reportFiltersAgenda.client!=='all' && a.clientId!==reportFiltersAgenda.client) return false;
      if(reportFiltersAgenda.status!=='all' && a.status!==reportFiltersAgenda.status) return false;
      if(reportFiltersAgenda.from && a.date < reportFiltersAgenda.from) return false;
      if(reportFiltersAgenda.to && a.date > reportFiltersAgenda.to) return false;
      return true;
    });
  }

  function renderReports(){
    return `
      <div class="method-toggle" style="margin-bottom:18px;">
        <button type="button" class="${reportMode==='pagar'?'is-active':''}" data-toggle="report-mode" data-value="pagar">Contas a pagar</button>
        <button type="button" class="${reportMode==='receber'?'is-active':''}" data-toggle="report-mode" data-value="receber">Contas a receber</button>
        <button type="button" class="${reportMode==='freq'?'is-active':''}" data-toggle="report-mode" data-value="freq">Frequência de clientes</button>
        <button type="button" class="${reportMode==='agenda'?'is-active':''}" data-toggle="report-mode" data-value="agenda">Agendamentos</button>
      </div>
      ${renderReportFiltersForMode()}
      <div id="report-results">${reportResultsForMode()}</div>
    `;
  }

  function renderReportFiltersForMode(){
    if(reportMode==='pagar') return renderReportPagarFilters();
    if(reportMode==='receber') return renderReportReceberFilters();
    if(reportMode==='freq') return renderReportFreqFilters();
    return renderReportAgendaFilters();
  }
  function reportResultsForMode(){
    if(reportMode==='pagar') return reportResultsPagarHTML();
    if(reportMode==='receber') return reportResultsReceberHTML();
    if(reportMode==='freq') return reportResultsFreqHTML();
    return reportResultsAgendaHTML();
  }

  function renderReportPagarFilters(){
    return `
      <div class="panel">
        <div class="panel-head"><h2>Filtrar contas a pagar</h2><span class="panel-sub">Vá afunilando do mais geral para o mais específico.</span></div>
        <div class="filter-steps">
          <div class="filter-step">
            <span class="step-label"><span class="step-num">1</span>Fornecedor</span>
            <select id="rf-supplier">
              <option value="all">Todos os fornecedores</option>
              ${db.suppliers.map(s=>`<option value="${s.id}" ${reportFiltersPagar.supplier===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">2</span>Cartão</span>
            <select id="rf-card">
              <option value="all">Todos</option>
              <option value="none" ${reportFiltersPagar.card==='none'?'selected':''}>Não pago com cartão</option>
              ${db.creditCards.map(c=>`<option value="${c.id}" ${reportFiltersPagar.card===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">3</span>Status</span>
            <select id="rf-status">
              <option value="all">Todos</option>
              <option value="pendente" ${reportFiltersPagar.status==='pendente'?'selected':''}>Pendente</option>
              <option value="pago" ${reportFiltersPagar.status==='pago'?'selected':''}>Pago</option>
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">4</span>Período (vencimento)</span>
            <div style="display:flex; gap:6px;">
              <input type="date" id="rf-from" value="${reportFiltersPagar.from}">
              <input type="date" id="rf-to" value="${reportFiltersPagar.to}">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderReportReceberFilters(){
    return `
      <div class="panel">
        <div class="panel-head"><h2>Filtrar contas a receber</h2><span class="panel-sub">Vá afunilando do mais geral para o mais específico.</span></div>
        <div class="filter-steps" style="grid-template-columns:repeat(3,1fr)">
          <div class="filter-step">
            <span class="step-label"><span class="step-num">1</span>Cliente</span>
            <select id="rf-client">
              <option value="all">Todos os clientes</option>
              ${db.clients.map(c=>`<option value="${c.id}" ${reportFiltersReceber.client===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">2</span>Status</span>
            <select id="rf-status">
              <option value="all">Todos</option>
              <option value="pendente" ${reportFiltersReceber.status==='pendente'?'selected':''}>Pendente</option>
              <option value="pago" ${reportFiltersReceber.status==='recebido'?'selected':''}>Recebido</option>
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">3</span>Período (vencimento)</span>
            <div style="display:flex; gap:6px;">
              <input type="date" id="rf-from" value="${reportFiltersReceber.from}">
              <input type="date" id="rf-to" value="${reportFiltersReceber.to}">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function reportResultsPagarHTML(){
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

  function reportResultsReceberHTML(){
    const list = filteredReceivables();
    const totalGeral = list.reduce((s,r)=>s+receivableTotal(r),0);
    const totalJuros = list.reduce((s,r)=>s+(Number(r.interest)||0),0);
    const totalMulta = list.reduce((s,r)=>s+(Number(r.penalty)||0),0);
    const totalPendente = list.filter(r=>r.status==='pendente').reduce((s,r)=>s+receivableTotal(r),0);

    const byClient = {};
    list.forEach(r=>{ byClient[r.clientId] = (byClient[r.clientId]||0) + receivableTotal(r); });

    const rows = list.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(r=>`
      <tr>
        <td>${esc(clientName(r.clientId))}</td>
        <td>${esc(r.description)}</td>
        <td>${fmtDate(r.issueDate)}</td>
        <td>${fmtDate(r.dueDate)}</td>
        <td class="num">${fmtMoney(r.value)}</td>
        <td class="num">${r.interest ? fmtMoney(r.interest) : '—'}</td>
        <td class="num">${r.penalty ? fmtMoney(r.penalty) : '—'}</td>
        <td class="num"><strong>${fmtMoney(receivableTotal(r))}</strong></td>
        <td><span class="badge ${r.status==='recebido'?'pago':'pendente'}">${r.status==='recebido'?'Recebido':'Pendente'}</span></td>
        <td>${r.bankAccountId ? esc(bankAccountName(r.bankAccountId)) : '—'}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="10">Nenhum resultado para os filtros selecionados.</td></tr>';

    const clientRows = Object.entries(byClient).map(([id,val])=>`
      <tr><td>${esc(clientName(id))}</td><td class="num">${fmtMoney(val)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="2">Sem dados.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Resultados</span><strong>${list.length}</strong></div>
        <div class="summary-box"><span>Total geral</span><strong>${fmtMoney(totalGeral)}</strong></div>
        <div class="summary-box"><span>Juros + multas</span><strong>${fmtMoney(totalJuros+totalMulta)}</strong></div>
        <div class="summary-box"><span>Pendente no filtro</span><strong style="color:var(--credit)">${fmtMoney(totalPendente)}</strong></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Contas no filtro</h2></div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr>
            <th>Cliente</th><th>Descrição</th><th>Emissão</th><th>Vencimento</th>
            <th class="num">Valor</th><th class="num">Juros</th><th class="num">Multa</th><th class="num">Total</th>
            <th>Status</th><th>Recebido via</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Total por cliente</h2></div>
        <table class="ledger"><thead><tr><th>Cliente</th><th class="num">Total</th></tr></thead><tbody>${clientRows}</tbody></table>
      </div>
    `;
  }

  function renderReportFreqFilters(){
    return `
      <div class="panel">
        <div class="panel-head"><h2>Filtrar frequência</h2><span class="panel-sub">Quantas vezes cada cliente agendou e compareceu.</span></div>
        <div class="filter-steps" style="grid-template-columns:repeat(2,1fr)">
          <div class="filter-step">
            <span class="step-label"><span class="step-num">1</span>Cliente</span>
            <select id="rf-client">
              <option value="all">Todos os clientes</option>
              ${db.clients.map(c=>`<option value="${c.id}" ${reportFiltersFreq.client===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">2</span>Período (data do agendamento)</span>
            <div style="display:flex; gap:6px;">
              <input type="date" id="rf-from" value="${reportFiltersFreq.from}">
              <input type="date" id="rf-to" value="${reportFiltersFreq.to}">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function reportResultsFreqHTML(){
    const list = filteredAppointmentsFreq();
    const totalGeral = list.length;
    const totalConfirmados = list.filter(a=>a.status==='confirmado').length;
    const taxaGeral = totalGeral ? Math.round((totalConfirmados/totalGeral)*100) : 0;

    const byClient = {};
    list.forEach(a=>{
      if(!byClient[a.clientId]) byClient[a.clientId] = { total:0, confirmados:0, ultima:null };
      const g = byClient[a.clientId];
      g.total++;
      if(a.status==='confirmado'){
        g.confirmados++;
        if(!g.ultima || a.date > g.ultima) g.ultima = a.date;
      }
    });

    const rows = Object.entries(byClient)
      .sort((a,b)=> b[1].total - a[1].total)
      .map(([id,g])=>{
        const taxa = g.total ? Math.round((g.confirmados/g.total)*100) : 0;
        return `<tr>
          <td>${esc(clientName(id))}</td>
          <td class="num">${g.total}</td>
          <td class="num">${g.confirmados}</td>
          <td class="num">${g.total-g.confirmados}</td>
          <td class="num">${taxa}%</td>
          <td>${g.ultima ? fmtDate(g.ultima) : '—'}</td>
        </tr>`;
      }).join('') || '<tr class="empty-row"><td colspan="6">Nenhum agendamento para os filtros selecionados.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Agendamentos no filtro</span><strong>${totalGeral}</strong></div>
        <div class="summary-box"><span>Presenças confirmadas</span><strong style="color:var(--credit)">${totalConfirmados}</strong></div>
        <div class="summary-box"><span>Taxa geral de comparecimento</span><strong>${taxaGeral}%</strong></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Frequência por cliente</h2></div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr><th>Cliente</th><th class="num">Agendados</th><th class="num">Confirmados</th><th class="num">Pendentes</th><th class="num">Taxa</th><th>Última visita confirmada</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  function renderReportAgendaFilters(){
    return `
      <div class="panel">
        <div class="panel-head"><h2>Filtrar agendamentos</h2><span class="panel-sub">Histórico detalhado, do mais recente ao mais antigo.</span></div>
        <div class="filter-steps">
          <div class="filter-step">
            <span class="step-label"><span class="step-num">1</span>Cliente</span>
            <select id="rf-client">
              <option value="all">Todos os clientes</option>
              ${db.clients.map(c=>`<option value="${c.id}" ${reportFiltersAgenda.client===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">2</span>Status</span>
            <select id="rf-status">
              <option value="all">Todos</option>
              <option value="agendado" ${reportFiltersAgenda.status==='agendado'?'selected':''}>Agendado</option>
              <option value="confirmado" ${reportFiltersAgenda.status==='confirmado'?'selected':''}>Confirmado</option>
            </select>
          </div>
          <div class="filter-step">
            <span class="step-label"><span class="step-num">3</span>Período</span>
            <div style="display:flex; gap:6px;">
              <input type="date" id="rf-from" value="${reportFiltersAgenda.from}">
              <input type="date" id="rf-to" value="${reportFiltersAgenda.to}">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function reportResultsAgendaHTML(){
    const list = filteredAppointmentsList().slice().sort((a,b)=> (b.date+b.time).localeCompare(a.date+a.time));
    const total = list.length;
    const confirmados = list.filter(a=>a.status==='confirmado').length;

    const rows = list.map(a=>`
      <tr>
        <td>${fmtDate(a.date)}</td>
        <td class="mono">${a.time} - ${a.endTime || '--:--'}</td>
        <td>${esc(clientName(a.clientId))}</td>
        <td><span class="badge ${a.status==='confirmado'?'pago':'pendente'}">${a.status==='confirmado'?'Confirmado':'Agendado'}</span></td>
        <td>${esc(a.notes||'—')}</td>
      </tr>`).join('') || '<tr class="empty-row"><td colspan="5">Nenhum agendamento para os filtros selecionados.</td></tr>';

    return `
      <div class="summary-strip">
        <div class="summary-box"><span>Resultados</span><strong>${total}</strong></div>
        <div class="summary-box"><span>Confirmados</span><strong style="color:var(--credit)">${confirmados}</strong></div>
        <div class="summary-box"><span>Pendentes</span><strong style="color:var(--debit)">${total-confirmados}</strong></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Histórico de agendamentos</h2></div>
        <div style="overflow-x:auto">
        <table class="ledger">
          <thead><tr><th>Data</th><th>Horário</th><th>Cliente</th><th>Status</th><th>Observações</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  function refreshReportResults(){
    const el = document.getElementById('report-results');
    if(el) el.innerHTML = reportResultsForMode();
  }

  /* ================================================================
     TABS / NAVEGAÇÃO
  ================================================================= */
  const TABS = {
    dashboard:    { title:'Painel',              render: renderDashboard },
    fornecedores: { title:'Fornecedores',        render: renderSuppliers },
    clientes:     { title:'Clientes',            render: renderClients },
    agenda:       { title:'Agenda',              render: renderAgenda },
    bancos:       { title:'Contas Bancárias',    render: renderBanks },
    pagar:        { title:'Contas a Pagar',      render: renderPayables },
    receber:      { title:'Contas a Receber',    render: renderReceivables },
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
      <div class="chip credit"><span>A receber</span><strong>${fmtMoney(totalReceivablesPending())}</strong></div>
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
    a.download = 'razao-backup-' + currentUser + '-' + todayISO() + '.json';
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
        if(!confirm('Importar este arquivo vai substituir todos os SEUS dados atuais. Continuar?')) return;
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
     TELA DE LOGIN / CADASTRO
  ================================================================= */
  function loginFormHTML(){
    return `
      <h2>Entrar</h2>
      <p class="modal-sub">Cada usuário tem seus próprios dados, independentes dos demais.</p>
      <form id="form-login">
        <div class="field full"><label>Usuário</label><input type="text" id="auth-username" required autofocus></div>
        <div class="field full"><label>Senha</label><input type="password" id="auth-password" required></div>
        <div id="auth-error" class="auth-error" hidden></div>
        <div class="form-actions" style="justify-content:stretch;">
          <button type="submit" class="btn" style="width:100%;">Entrar</button>
        </div>
      </form>
      <p class="auth-switch">Não tem conta? <button type="button" class="link-btn" data-action="show-register">Criar usuário</button></p>
    `;
  }
  function registerFormHTML(){
    return `
      <h2>Criar usuário</h2>
      <p class="modal-sub">Sua senha fica só neste navegador — não existe servidor nesta aplicação.</p>
      <form id="form-register">
        <div class="field full"><label>Usuário</label><input type="text" id="auth-username" required autofocus></div>
        <div class="field full"><label>Senha</label><input type="password" id="auth-password" minlength="4" required></div>
        <div class="field full"><label>Confirmar senha</label><input type="password" id="auth-password2" required></div>
        <div id="auth-error" class="auth-error" hidden></div>
        <div class="form-actions" style="justify-content:stretch;">
          <button type="submit" class="btn" style="width:100%;">Criar e entrar</button>
        </div>
      </form>
      <p class="auth-switch">Já tem conta? <button type="button" class="link-btn" data-action="show-login">Entrar</button></p>
    `;
  }
  function renderAuthBody(mode){
    document.getElementById('auth-body').innerHTML = mode==='register' ? registerFormHTML() : loginFormHTML();
  }
  function showAuthError(msg){
    const el = document.getElementById('auth-error');
    if(el){ el.textContent = msg; el.hidden = false; }
  }

  function migrateLegacyDataIfAny(username){
    const legacy = localStorage.getItem(LEGACY_KEY);
    if(!legacy) return;
    if(confirm('Encontramos dados salvos de antes do login existir. Deseja migrar esses dados para esta nova conta?')){
      localStorage.setItem(dbKeyFor(username), legacy);
      localStorage.removeItem(LEGACY_KEY);
    }
  }

  function loginAs(username){
    currentUser = username;
    localStorage.setItem(SESSION_KEY, username);
    db = loadDBForCurrentUser();
    selectedBankId = null; selectedCardId = null;
    currentTab = 'dashboard';
    document.getElementById('auth-screen').classList.add('is-hidden');
    document.getElementById('app').classList.remove('is-hidden');
    const label = document.getElementById('current-user-label');
    if(label) label.textContent = username;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('is-active', b.dataset.tab==='dashboard'));
    renderTab();
  }

  function logout(){
    currentUser = null;
    db = defaultDB();
    localStorage.removeItem(SESSION_KEY);
    document.getElementById('app').classList.add('is-hidden');
    document.getElementById('auth-screen').classList.remove('is-hidden');
    renderAuthBody('login');
  }

  async function handleLoginSubmit(){
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if(!username || !password){ showAuthError('Preencha usuário e senha.'); return; }
    const users = loadUsers();
    const user = users.find(u=>u.username.toLowerCase()===username.toLowerCase());
    if(!user){ showAuthError('Usuário não encontrado.'); return; }
    const hash = await hashPassword(password);
    if(hash !== user.passwordHash){ showAuthError('Senha incorreta.'); return; }
    loginAs(user.username);
  }

  async function handleRegisterSubmit(){
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const password2 = document.getElementById('auth-password2').value;
    if(!username || !password){ showAuthError('Preencha usuário e senha.'); return; }
    if(password.length<4){ showAuthError('A senha precisa ter ao menos 4 caracteres.'); return; }
    if(password !== password2){ showAuthError('As senhas não coincidem.'); return; }
    const users = loadUsers();
    if(users.some(u=>u.username.toLowerCase()===username.toLowerCase())){ showAuthError('Esse nome de usuário já existe.'); return; }
    const isFirstUser = users.length===0;
    const passwordHash = await hashPassword(password);
    users.push({ username, passwordHash, createdAt: Date.now() });
    saveUsers(users);
    if(isFirstUser) migrateLegacyDataIfAny(username);
    loginAs(username);
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

      // Autenticação
      case 'show-register': renderAuthBody('register'); break;
      case 'show-login': renderAuthBody('login'); break;
      case 'logout': if(confirm('Sair da conta?')) logout(); break;

      // Fornecedores
      case 'add-supplier': openModal(supplierFormHTML(null)); break;
      case 'edit-supplier': openModal(supplierFormHTML(db.suppliers.find(s=>s.id===id))); break;
      case 'delete-supplier': deleteSupplier(id); break;

      // Clientes
      case 'add-client': openModal(clientFormHTML(null)); break;
      case 'edit-client': openModal(clientFormHTML(db.clients.find(c=>c.id===id))); break;
      case 'delete-client': deleteClient(id); break;
      case 'goto-clientes-from-modal': closeModal(); goToTab('clientes'); break;

      // Bancos
      case 'add-bank': openModal(bankFormHTML(null)); break;
      case 'edit-bank': openModal(bankFormHTML(db.bankAccounts.find(a=>a.id===id))); break;
      case 'delete-bank': deleteBank(id); break;
      case 'select-bank': selectedBankId = (selectedBankId===id ? null : id); renderTab(); break;
      case 'bank-move': openModal(bankMoveFormHTML(id)); break;
      case 'bank-pay-debt': openModal(bankPayDebtFormHTML(id)); break;
      case 'bank-receive-debt': openModal(bankReceiveDebtFormHTML(id)); break;
      case 'delete-bank-tx':
        if(confirm('Excluir esta movimentação? Se estiver vinculada a um pagamento/recebimento, a conta voltará a ficar pendente.')){
          if(deleteBankTransaction(id)){ renderTab(); toast('Movimentação excluída.'); }
        }
        break;
      case 'pick-payable-for-bank': {
        const accountId = el.closest('.option-list').dataset.accountId;
        if(payPayableViaBank(id, accountId)){ closeModal(); renderTab(); toast('Conta paga e conta bancária debitada.'); }
        break;
      }
      case 'pick-receivable-for-bank': {
        const accountId = el.closest('.option-list').dataset.accountId;
        if(receiveReceivableViaBank(id, accountId)){ closeModal(); renderTab(); toast('Recebimento lançado e conta creditada.'); }
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
          if(reversePayablePayment(id)){ renderTab(); toast('Pagamento revertido.'); }
        }
        break;

      // Contas a receber
      case 'add-receivable': openModal(receivableFormHTML(null)); break;
      case 'edit-receivable': openModal(receivableFormHTML(db.receivables.find(r=>r.id===id))); break;
      case 'delete-receivable': deleteReceivable(id); break;
      case 'receive-receivable': receiveModalReceivableId = id; openModal(receiveReceivableFormHTML(id)); break;
      case 'reverse-receivable':
        if(confirm('Reverter este recebimento? A conta voltará para pendente e o lançamento vinculado será removido.')){
          if(reverseReceivableReceipt(id)){ renderTab(); toast('Recebimento revertido.'); }
        }
        break;

      // Agenda
      case 'schedule-appointment': openModal(appointmentFormHTML(null, el.dataset.date, el.dataset.hour)); break;
      case 'edit-appointment': openModal(appointmentFormHTML(db.appointments.find(a=>a.id===id))); break;
      case 'confirm-appointment': confirmAppointmentPresence(id); break;
      case 'unconfirm-appointment': unconfirmAppointment(id); break;
      case 'delete-appointment': deleteAppointment(id); break;
      case 'agenda-prev-week': agendaWeekStart = addDaysISO(agendaWeekStart, -7); renderTab(); break;
      case 'agenda-next-week': agendaWeekStart = addDaysISO(agendaWeekStart, 7); renderTab(); break;
      case 'agenda-today': agendaWeekStart = mondayOf(todayISO()); renderTab(); break;

      // Cartões
      case 'add-card': openModal(cardFormHTML(null)); break;
      case 'edit-card': openModal(cardFormHTML(db.creditCards.find(c=>c.id===id))); break;
      case 'delete-card': deleteCard(id); break;
      case 'select-card': selectedCardId = (selectedCardId===id ? null : id); renderTab(); break;
      case 'card-purchase': openModal(cardPurchaseFormHTML(id)); break;
      case 'card-settle': openModal(cardSettleFormHTML(id)); break;
      case 'delete-card-tx':
        if(confirm('Excluir este lançamento do cartão?')){ if(deleteCardTransaction(id)){ renderTab(); toast('Lançamento excluído.'); } }
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

  // Toggle método de pagamento (banco/cartão) no modal de pagar conta a pagar
  let payModalPayableId = null;
  let receiveModalReceivableId = null;
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
    const modeToggle = e.target.closest('[data-toggle="report-mode"]');
    if(modeToggle){
      reportMode = modeToggle.dataset.value;
      renderTab();
      return;
    }
    const pickBank = e.target.closest('[data-action="pick-bank-for-pay"]');
    if(pickBank && payModalPayableId){
      if(payPayableViaBank(payModalPayableId, pickBank.dataset.id)){
        closeModal(); renderTab(); toast('Conta paga e conta bancária debitada.');
      }
      return;
    }
    const pickCard = e.target.closest('[data-action="pick-card-for-pay"]');
    if(pickCard && payModalPayableId){
      payPayableViaCard(payModalPayableId, pickCard.dataset.id);
      closeModal(); renderTab(); toast('Conta lançada na fatura do cartão.');
      return;
    }
    const pickBankReceive = e.target.closest('[data-action="pick-bank-for-receive"]');
    if(pickBankReceive && receiveModalReceivableId){
      if(receiveReceivableViaBank(receiveModalReceivableId, pickBankReceive.dataset.id)){
        closeModal(); renderTab(); toast('Recebimento lançado e conta creditada.');
      }
      return;
    }
  });

  // Guardar o id em contexto ao abrir os modais de pagar/receber
  document.addEventListener('click', (e)=>{
    const payEl = e.target.closest('[data-action="pay-payable"]');
    if(payEl) payModalPayableId = payEl.dataset.id;
  });

  // Nav lateral
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=> goToTab(btn.dataset.tab));
  });

  // Submits de formulários (delegado)
  document.addEventListener('submit', (e)=>{
    e.preventDefault();
    switch(e.target.id){
      case 'form-login': handleLoginSubmit(); break;
      case 'form-register': handleRegisterSubmit(); break;
      case 'form-supplier': saveSupplierForm(e.target); break;
      case 'form-client': saveClientForm(e.target); break;
      case 'form-bank': saveBankForm(e.target); break;
      case 'form-bank-move': saveBankMoveForm(e.target); break;
      case 'form-payable': savePayableForm(e.target); break;
      case 'form-receivable': saveReceivableForm(e.target); break;
      case 'form-card': saveCardForm(e.target); break;
      case 'form-card-purchase': saveCardPurchaseForm(e.target); break;
      case 'form-appointment': saveAppointmentForm(e.target); break;
      default: break;
    }
  });

  // Recalcular total ao vivo (contas a pagar / a receber)
  document.addEventListener('input', (e)=>{
    if(e.target.classList && e.target.classList.contains('calc-field')) recalcPayablePreview();
    if(e.target.classList && e.target.classList.contains('calc-field-r')) recalcReceivablePreview();
  });

  // Parcelas: gerar/atualizar datas das parcelas
  document.addEventListener('change', (e)=>{
    if(e.target.id==='f-parcelas'){
      const formEl = e.target.closest('form');
      if(formEl && (formEl.id==='form-payable' || formEl.id==='form-receivable')) renderInstallmentDates();
    }
    // Filtros de relatórios
    if(e.target.id==='rf-supplier'){ reportFiltersPagar.supplier = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-card'){ reportFiltersPagar.card = e.target.value; refreshReportResults(); }
    if(e.target.id==='rf-client'){
      if(reportMode==='receber') reportFiltersReceber.client = e.target.value;
      else if(reportMode==='freq') reportFiltersFreq.client = e.target.value;
      else if(reportMode==='agenda') reportFiltersAgenda.client = e.target.value;
      refreshReportResults();
    }
    if(e.target.id==='rf-status'){
      if(reportMode==='pagar') reportFiltersPagar.status = e.target.value;
      else if(reportMode==='receber') reportFiltersReceber.status = e.target.value;
      else if(reportMode==='agenda') reportFiltersAgenda.status = e.target.value;
      refreshReportResults();
    }
    if(e.target.id==='rf-from'){
      if(reportMode==='pagar') reportFiltersPagar.from = e.target.value;
      else if(reportMode==='receber') reportFiltersReceber.from = e.target.value;
      else if(reportMode==='freq') reportFiltersFreq.from = e.target.value;
      else if(reportMode==='agenda') reportFiltersAgenda.from = e.target.value;
      refreshReportResults();
    }
    if(e.target.id==='rf-to'){
      if(reportMode==='pagar') reportFiltersPagar.to = e.target.value;
      else if(reportMode==='receber') reportFiltersReceber.to = e.target.value;
      else if(reportMode==='freq') reportFiltersFreq.to = e.target.value;
      else if(reportMode==='agenda') reportFiltersAgenda.to = e.target.value;
      refreshReportResults();
    }
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

  /* ================================================================
     INICIALIZAÇÃO
  ================================================================= */
  (function initAuth(){
    renderAuthBody('login');
    const saved = localStorage.getItem(SESSION_KEY);
    const users = loadUsers();
    if(saved && users.some(u=>u.username===saved)){
      loginAs(saved);
    }
  })();

})();
