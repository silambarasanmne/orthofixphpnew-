/* ==========================================================================
   SUPER ADMIN CONTROL PORTAL CONTROLLER
   Manages: OP Patient Table, Doctor Consultant Table, Billing Sale Table,
   and Screen-Based User Credential Creation & Management.
   ========================================================================== */

const SuperAdmin = {
  activeSection: 'op',
  opPatients: [],
  consultations: [],
  sales: [],
  users: [],
  selectedSale: null,
  activeUserId: null,

  init() {
    this.bindEvents();
    this.loadAllData();
  },

  switchSection(sectionId) {
    this.activeSection = sectionId;

    // Show active section, hide others
    const sections = document.querySelectorAll('.sa-section');
    sections.forEach(sec => {
      if (sec.id === `sec-${sectionId}`) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    });

    // Re-render target section content to ensure table is populated when visible
    if (sectionId === 'worker') {
      this.renderUsers(this.users);
    } else if (sectionId === 'op') {
      this.renderOPPatients(this.opPatients);
    } else if (sectionId === 'doctor') {
      this.renderConsultations(this.consultations);
    } else if (sectionId === 'billing') {
      this.renderSales(this.sales);
    }

    // Update Top Header Buttons
    const topBtns = document.querySelectorAll('.sa-top-btn');
    topBtns.forEach(btn => {
      if (btn.id === `top-btn-${sectionId}`) {
        btn.className = 'sa-top-btn px-3.5 py-1.5 bg-sky-600 text-white rounded-xl text-xs font-bold transition-all border border-sky-500 shadow-md';
      } else {
        btn.className = 'sa-top-btn px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700';
      }
    });

    // Update Sidebar Navigation Buttons
    const sideBtns = document.querySelectorAll('.sa-side-btn');
    sideBtns.forEach(btn => {
      if (btn.id === `side-nav-${sectionId}`) {
        btn.className = 'sa-side-btn w-full flex items-center gap-3 px-3.5 py-3 bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/30 transition-all text-left';
      } else {
        btn.className = 'sa-side-btn w-full flex items-center gap-3 px-3.5 py-3 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl font-semibold text-sm transition-all text-left';
      }
    });

    // Update Active Section Title in Header
    const titleEl = document.getElementById('sa-active-section-title');
    if (titleEl) {
      switch (sectionId) {
        case 'op':
          titleEl.textContent = '📋 OP Patient Details Table';
          break;
        case 'doctor':
          titleEl.textContent = '🩺 Doctor Consultant Details Table';
          break;
        case 'billing':
          titleEl.textContent = '💰 Billing Sale Details Table';
          break;
        case 'worker':
          titleEl.textContent = '🔑 Worker Management';
          break;
      }
    }
  },

  bindEvents() {
    // Navigation Tabs
    const tabButtons = document.querySelectorAll('.sa-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Screen selection cards in User Creation form
    const screenCards = document.querySelectorAll('.screen-select-card');
    screenCards.forEach(card => {
      card.addEventListener('click', (e) => {
        screenCards.forEach(c => c.classList.remove('border-sky-500', 'bg-sky-500/10', 'ring-2', 'ring-sky-500'));
        e.currentTarget.classList.add('border-sky-500', 'bg-sky-500/10', 'ring-2', 'ring-sky-500');
        const role = e.currentTarget.getAttribute('data-role');
        const roleInput = document.getElementById('sa-user-role');
        if (roleInput) roleInput.value = role;
      });
    });

    // Create User Form Submission
    const createUserForm = document.getElementById('sa-create-user-form');
    if (createUserForm) {
      createUserForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCreateUser(e);
      });
    }

    // Search & Filters for OP Patients
    const opSearch = document.getElementById('sa-op-search');
    if (opSearch) {
      opSearch.addEventListener('input', () => this.filterOPPatients());
    }

    // Search & Filters for Doctor Consultations
    const docSearch = document.getElementById('sa-doc-search');
    const docStatusFilter = document.getElementById('sa-doc-status-filter');
    if (docSearch) docSearch.addEventListener('input', () => this.filterConsultations());
    if (docStatusFilter) docStatusFilter.addEventListener('change', () => this.filterConsultations());

    // Search & Filters for Billing Sales
    const saleSearch = document.getElementById('sa-sale-search');
    const salePayFilter = document.getElementById('sa-sale-pay-filter');
    if (saleSearch) saleSearch.addEventListener('input', () => this.filterSales());
    if (salePayFilter) salePayFilter.addEventListener('change', () => this.filterSales());

    // Search for Users
    const userSearch = document.getElementById('sa-user-search');
    if (userSearch) userSearch.addEventListener('input', () => this.filterUsers());
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    const tabButtons = document.querySelectorAll('.sa-tab-btn');
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.remove('text-slate-400', 'hover:bg-slate-800');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.add('text-slate-400', 'hover:bg-slate-800');
      }
    });

    const tabContents = document.querySelectorAll('.sa-tab-content');
    tabContents.forEach(content => {
      if (content.id === `sa-tab-${tabName}`) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
  },

  async loadAllData() {
    if (typeof UI !== 'undefined' && typeof UI.showLoading === 'function') UI.showLoading();
    try {
      await Promise.all([
        this.fetchOPPatients(),
        this.fetchConsultations(),
        this.fetchSales(),
        this.fetchUsers()
      ]);
      if (typeof this.renderKPIs === 'function') this.renderKPIs();
      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
    } catch (err) {
      console.error('SuperAdmin load error:', err);
      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
      if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast('Failed to load portal data.', 'error');
    }
  },

  renderKPIs() {
    // OP Patients Count
    const opCountEl = document.getElementById('kpi-op-count');
    if (opCountEl) opCountEl.textContent = this.opPatients.length;

    // Doctor Consultations Count
    const docCountEl = document.getElementById('kpi-doc-count');
    if (docCountEl) docCountEl.textContent = this.consultations.length;

    // Total Sales Revenue
    const salesRevEl = document.getElementById('kpi-sales-rev');
    const totalRev = this.sales.reduce((sum, s) => sum + (parseFloat(s.grand_total) || 0), 0);
    if (salesRevEl) salesRevEl.textContent = `₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Active Users Count
    const usersCountEl = document.getElementById('kpi-users-count');
    const activeUsers = (this.users || []).filter(u => u.is_active).length;
    if (usersCountEl) usersCountEl.textContent = `${activeUsers} Active / ${this.users.length} Total`;
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // ==========================================
  // 1. OP PATIENT TABLE
  // ==========================================
  async fetchOPPatients() {
    try {
      const res = await API.get('/patients');
      if (res.success) {
        this.opPatients = res.data || [];
        this.renderOPPatients(this.opPatients);
      }
    } catch (e) {
      console.error('Fetch OP Patients error:', e);
    }
  },

  renderOPPatients(patientsList) {
    const tbody = document.getElementById('sa-op-tbody');
    if (!tbody) return;

    if (!patientsList || patientsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400 font-medium">No OP Patients found.</td></tr>`;
      return;
    }

    tbody.innerHTML = patientsList.map(p => {
      const createdDate = p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : 'N/A';
      return `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
          <td class="px-5 py-3.5">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-sky-500/15 text-sky-400 border border-sky-500/30">
              #${p.token}
            </span>
          </td>
          <td class="px-5 py-3.5 font-bold text-slate-100">${UI.escapeHtml(p.patient_name)}</td>
          <td class="px-5 py-3.5 font-semibold text-slate-300">${p.age} Yrs</td>
          <td class="px-5 py-3.5 font-mono text-slate-300">${UI.escapeHtml(p.mobile)}</td>
          <td class="px-5 py-3.5 max-w-xs truncate text-slate-400" title="${UI.escapeHtml(p.symptoms)}">
            ${UI.escapeHtml(p.symptoms)}
          </td>
          <td class="px-5 py-3.5 text-xs text-slate-400">${createdDate}</td>
          <td class="px-5 py-3.5 text-right">
            <button onclick="SuperAdmin.deletePatient(${p.id}, '${UI.escapeHtml(p.patient_name)}')" class="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition-colors">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterOPPatients() {
    const query = (document.getElementById('sa-op-search')?.value || '').toLowerCase().trim();
    if (!query) {
      this.renderOPPatients(this.opPatients);
      return;
    }
    const filtered = this.opPatients.filter(p => 
      String(p.token).includes(query) ||
      (p.patient_name && p.patient_name.toLowerCase().includes(query)) ||
      (p.mobile && p.mobile.includes(query)) ||
      (p.symptoms && p.symptoms.toLowerCase().includes(query))
    );
    this.renderOPPatients(filtered);
  },

  async deletePatient(id, name) {
    if (!confirm(`Are you sure you want to delete patient "${name}"? This action cannot be undone.`)) return;

    try {
      const res = await API.delete(`/patients/${id}`);
      if (res.success) {
        UI.showToast(`Patient "${name}" deleted successfully.`, 'success');
        this.fetchOPPatients();
      } else {
        UI.showToast(res.message || 'Failed to delete patient.', 'error');
      }
    } catch (err) {
      UI.showToast(err.message || 'Error deleting patient.', 'error');
    }
  },

  // ==========================================
  // 2. DOCTOR CONSULTANT TABLE
  // ==========================================
  async fetchConsultations() {
    try {
      const res = await API.get('/prescriptions/all');
      if (res.success) {
        this.consultations = res.prescriptions || [];
        this.renderConsultations(this.consultations);
      }
    } catch (e) {
      console.error('Fetch Consultations error:', e);
    }
  },

  renderConsultations(list) {
    const tbody = document.getElementById('sa-doc-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400 font-medium">No Doctor Consultations found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(c => {
      const createdDate = c.created_at ? new Date(c.created_at).toLocaleString('en-IN') : 'N/A';
      const isBilled = c.status === 'Billed';
      const statusBadge = isBilled
        ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">✓ Billed</span>`
        : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">⏳ Pending</span>`;

      return `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
          <td class="px-5 py-3.5 font-bold text-sky-400">#${c.patient_token}</td>
          <td class="px-5 py-3.5 font-bold text-slate-100">
            ${UI.escapeHtml(c.patient_name || 'N/A')}
            <div class="text-xs font-normal text-slate-400">${c.age ? c.age + ' Yrs | ' : ''}${UI.escapeHtml(c.mobile || '')}</div>
          </td>
          <td class="px-5 py-3.5 font-semibold text-indigo-300">${UI.escapeHtml(c.doctor_name || 'Dr. Specialist')}</td>
          <td class="px-5 py-3.5 max-w-xs truncate text-slate-300" title="${UI.escapeHtml(c.symptoms || c.complaints || '')}">
            ${UI.escapeHtml(c.symptoms || c.complaints || 'None recorded')}
          </td>
          <td class="px-5 py-3.5 max-w-xs text-slate-400 text-xs italic" title="${UI.escapeHtml(c.doctor_comment || '')}">
            "${UI.escapeHtml(c.doctor_comment || 'No notes')}"
          </td>
          <td class="px-5 py-3.5">${statusBadge}</td>
          <td class="px-5 py-3.5 text-xs text-slate-400">${createdDate}</td>
        </tr>
      `;
    }).join('');
  },

  filterConsultations() {
    const query = (document.getElementById('sa-doc-search')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('sa-doc-status-filter')?.value || 'all';

    let filtered = this.consultations;

    if (statusVal !== 'all') {
      filtered = filtered.filter(c => c.status === statusVal);
    }

    if (query) {
      filtered = filtered.filter(c =>
        String(c.patient_token).includes(query) ||
        (c.patient_name && c.patient_name.toLowerCase().includes(query)) ||
        (c.doctor_name && c.doctor_name.toLowerCase().includes(query)) ||
        (c.symptoms && c.symptoms.toLowerCase().includes(query))
      );
    }

    this.renderConsultations(filtered);
  },

  // ==========================================
  // 3. BILLING SALE TABLE
  // ==========================================
  async fetchSales() {
    try {
      const res = await API.get('/billing/history');
      if (res.success) {
        this.sales = res.sales || [];
        this.renderSales(this.sales);
      }
    } catch (e) {
      console.error('Fetch Sales error:', e);
    }
  },

  renderSales(salesList) {
    const tbody = document.getElementById('sa-sale-tbody');
    if (!tbody) return;

    if (!salesList || salesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-slate-400 font-medium">No Billing Sales found.</td></tr>`;
      return;
    }

    tbody.innerHTML = salesList.map(s => {
      const createdDate = s.created_at ? new Date(s.created_at).toLocaleString('en-IN') : 'N/A';
      return `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
          <td class="px-5 py-3.5 font-bold font-mono text-sky-400">${UI.escapeHtml(s.invoice_number)}</td>
          <td class="px-5 py-3.5 font-bold text-slate-100">
            ${UI.escapeHtml(s.customer_name || 'Walk-in Customer')}
            <div class="text-xs font-normal text-slate-400">${UI.escapeHtml(s.customer_phone || '')}</div>
          </td>
          <td class="px-5 py-3.5 font-semibold text-slate-300">₹${parseFloat(s.subtotal || 0).toFixed(2)}</td>
          <td class="px-5 py-3.5 font-semibold text-rose-400">-₹${parseFloat(s.discount_amount || 0).toFixed(2)}</td>
          <td class="px-5 py-3.5 font-black text-emerald-400 text-base">₹${parseFloat(s.grand_total || 0).toFixed(2)}</td>
          <td class="px-5 py-3.5">
            <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              ${UI.escapeHtml(s.payment_method)}
            </span>
          </td>
          <td class="px-5 py-3.5 text-xs text-slate-300">
            <div class="font-bold text-teal-400">${UI.escapeHtml(s.worker_name)}</div>
            <div class="text-[11px] text-slate-400">${UI.escapeHtml(s.doctor_name || '')}</div>
          </td>
          <td class="px-5 py-3.5 text-right">
            <button onclick="SuperAdmin.viewSaleDetails(${s.id})" class="px-3 py-1.5 text-xs font-bold bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white rounded-lg border border-sky-500/40 transition-all">
              View Invoice
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterSales() {
    const query = (document.getElementById('sa-sale-search')?.value || '').toLowerCase().trim();
    const payVal = document.getElementById('sa-sale-pay-filter')?.value || 'all';

    let filtered = this.sales;

    if (payVal !== 'all') {
      filtered = filtered.filter(s => s.payment_method === payVal);
    }

    if (query) {
      filtered = filtered.filter(s =>
        (s.invoice_number && s.invoice_number.toLowerCase().includes(query)) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(query)) ||
        (s.customer_phone && s.customer_phone.includes(query)) ||
        (s.worker_name && s.worker_name.toLowerCase().includes(query))
      );
    }

    this.renderSales(filtered);
  },

  async viewSaleDetails(saleId) {
    try {
      const res = await API.get(`/billing/invoice/${saleId}`);
      if (res.success && res.invoice) {
        const sale = res.invoice;
        const items = sale.items || [];

        const modal = document.getElementById('sa-invoice-modal');
        const content = document.getElementById('sa-invoice-modal-content');
        if (!modal || !content) return;

        content.innerHTML = `
          <div class="border-b border-slate-700 pb-4 mb-4 flex justify-between items-start">
            <div>
              <h3 class="text-xl font-black text-white">Invoice #${UI.escapeHtml(sale.invoice_number)}</h3>
              <p class="text-xs text-slate-400">Date: ${new Date(sale.created_at).toLocaleString('en-IN')}</p>
            </div>
            <div class="text-right">
              <span class="px-3 py-1 text-xs font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Paid via ${UI.escapeHtml(sale.payment_method)}
              </span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 text-xs mb-4 p-3 bg-slate-800/60 rounded-xl border border-slate-700">
            <div>
              <span class="text-slate-400">Customer:</span>
              <p class="font-bold text-slate-100">${UI.escapeHtml(sale.customer_name || 'Walk-in Customer')}</p>
              <p class="text-slate-300">${UI.escapeHtml(sale.customer_phone || 'No phone')}</p>
            </div>
            <div>
              <span class="text-slate-400">Biller / Cashier:</span>
              <p class="font-bold text-teal-300">${UI.escapeHtml(sale.worker_name)}</p>
              <p class="text-slate-300">Doctor: ${UI.escapeHtml(sale.doctor_name || 'N/A')}</p>
            </div>
          </div>

          <table class="w-full text-left text-xs mb-4">
            <thead>
              <tr class="bg-slate-800 text-slate-400 border-b border-slate-700">
                <th class="p-2.5">Item Name</th>
                <th class="p-2.5">Batch</th>
                <th class="p-2.5 text-right">Price</th>
                <th class="p-2.5 text-center">Qty</th>
                <th class="p-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              ${items.map(it => `
                <tr class="hover:bg-slate-800/40">
                  <td class="p-2.5 font-bold text-slate-200">${UI.escapeHtml(it.medicine_name)}</td>
                  <td class="p-2.5 font-mono text-slate-400">${UI.escapeHtml(it.batch_number || '-')}</td>
                  <td class="p-2.5 text-right text-slate-300">₹${parseFloat(it.unit_price).toFixed(2)}</td>
                  <td class="p-2.5 text-center font-bold text-slate-200">${it.quantity}</td>
                  <td class="p-2.5 text-right font-bold text-emerald-400">₹${parseFloat(it.total_price).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="border-t border-slate-700 pt-3 space-y-1.5 text-xs text-right">
            <div class="flex justify-between text-slate-400"><span>Subtotal:</span><span>₹${parseFloat(sale.subtotal).toFixed(2)}</span></div>
            <div class="flex justify-between text-rose-400"><span>Discount:</span><span>-₹${parseFloat(sale.discount_amount || 0).toFixed(2)}</span></div>
            <div class="flex justify-between text-base font-black text-white pt-2 border-t border-slate-700"><span>Grand Total:</span><span class="text-emerald-400">₹${parseFloat(sale.grand_total).toFixed(2)}</span></div>
          </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    } catch (e) {
      UI.showToast('Failed to view invoice details.', 'error');
    }
  },

  closeInvoiceModal() {
    const modal = document.getElementById('sa-invoice-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  // ==========================================
  // 4. SCREEN-BASED USER MANAGEMENT
  // ==========================================
  async fetchUsers() {
    try {
      const res = await API.get('/users');
      if (res && (res.success || Array.isArray(res.users) || Array.isArray(res.data))) {
        this.users = res.users || res.data || [];
        this.renderUsers(this.users);
      } else {
        console.warn('Fetch users returned:', res);
        this.users = [];
        this.renderUsers([]);
      }
    } catch (e) {
      console.error('Fetch Users error:', e);
      this.users = [];
      this.renderUsers([]);
    }
  },

  toggleTablePass(id, passVal) {
    const span = document.getElementById(`tp-${id}`);
    if (!span) return;
    if (span.textContent === '••••••••') {
      span.textContent = passVal;
      span.classList.add('text-amber-400', 'font-bold');
    } else {
      span.textContent = '••••••••';
      span.classList.remove('text-amber-400', 'font-bold');
    }
  },

  renderUsers(userList) {
    const tbody = document.getElementById('sa-user-tbody');
    if (!tbody) return;

    if (!userList || userList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 font-medium">No system user credentials created yet. Select a screen role above to create credentials.</td></tr>`;
      return;
    }

    tbody.innerHTML = userList.map(u => {
      const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : 'N/A';
      
      const rawPass = u.plain_password || (this.userPasswords && this.userPasswords[u.username]) || '********';
      const displayPass = this.escapeHtml(rawPass);
      
      const eyeButton = `<button type="button" onclick="SuperAdmin.toggleTablePass(${u.id}, '${displayPass}')" class="text-slate-400 hover:text-white p-1 transition-colors" title="View/Hide Password">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </button>`;

      // Role badge colors & Screen label
      let screenBadge = '';
      switch (u.role) {
        case 'OP Worker':
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">OP Screen</span>`;
          break;
        case 'Doctor':
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">Doctor Screen</span>`;
          break;
        case 'Billing Worker':
        case 'Medical Billing Worker':
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">Billing Worker Screen</span>`;
          break;
        case 'Billing Manager':
        case 'Medical Manager':
        case 'Admin / Billing Manager':
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Billing Manager Screen</span>`;
          break;
        case 'Super Admin':
        case 'Admin':
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">Super Admin</span>`;
          break;
        default:
          screenBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300">${UI.escapeHtml(u.role)}</span>`;
      }

      return `
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
          <td class="px-4 py-3.5 font-bold font-mono text-sky-400">#${u.id}</td>
          <td class="px-4 py-3.5 font-bold text-slate-100">${UI.escapeHtml(u.full_name)}</td>
          <td class="px-4 py-3.5 font-bold font-mono text-sky-400">@${UI.escapeHtml(u.username)}</td>
          <td class="px-4 py-3.5 font-mono text-slate-300">
            <div class="flex items-center gap-1.5">
              <span id="tp-${u.id}">••••••••</span>
              ${eyeButton}
            </div>
          </td>
          <td class="px-4 py-3.5">${screenBadge}</td>
          <td class="px-4 py-3.5 text-right space-x-2">
            <button onclick="SuperAdmin.openResetModal(${u.id}, '${UI.escapeHtml(u.username)}')" class="px-2.5 py-1 text-xs font-bold text-amber-400 hover:bg-amber-500/20 rounded-lg border border-amber-500/30 transition-colors">
              Reset Pass
            </button>
            <button onclick="SuperAdmin.deleteUser(${u.id}, '${UI.escapeHtml(u.username)}')" class="px-2.5 py-1 text-xs font-bold text-rose-400 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition-colors">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user account "@${username}"? This action cannot be undone.`)) return;

    if (typeof UI !== 'undefined' && typeof UI.showLoading === 'function') UI.showLoading();
    try {
      const res = await API.delete(`/users/${userId}`);
      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
      if (res.success) {
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(`User "@${username}" deleted successfully.`, 'success');
        this.fetchUsers();
        this.renderKPIs();
      } else {
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(res.message || 'Failed to delete user.', 'error');
      }
    } catch (err) {
      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
      if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(err.message || 'Error deleting user.', 'error');
    }
  },

  filterUsers() {
    const query = (document.getElementById('sa-user-search')?.value || '').toLowerCase().trim();
    if (!query) {
      this.renderUsers(this.users);
      return;
    }
    const filtered = this.users.filter(u =>
      u.username.toLowerCase().includes(query) ||
      u.full_name.toLowerCase().includes(query) ||
      u.role.toLowerCase().includes(query)
    );
    this.renderUsers(filtered);
  },

  toggleTablePass(userId, actualPass) {
    const span = document.getElementById(`tp-${userId}`);
    if (!span) return;
    if (span.textContent === '••••••••') {
      span.textContent = actualPass;
    } else {
      span.textContent = '••••••••';
    }
  },

  togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) {
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a8.959 8.959 0 013.98-1.063c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m-1.99-2.029a3 3 0 11-4.243-4.243M3 3l18 18"/>`;
      }
    } else {
      input.type = 'password';
      if (icon) {
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
      }
    }
  },

  getInputValue(id) {
    const el = document.getElementById(id);
    return el && el.value ? el.value.trim() : '';
  },

  async handleCreateUser(e) {
    if (e && e.preventDefault) e.preventDefault();

    const fullName = this.getInputValue('sa-new-fullname');
    const username = this.getInputValue('sa-new-username');
    const password = this.getInputValue('sa-new-password');
    const role = this.getInputValue('sa-user-role') || 'OP Worker';
    const email = this.getInputValue('sa-new-email');
    const mobile = this.getInputValue('sa-new-mobile');

    if (!fullName || !username || !password || !role) {
      UI.showToast('Please fill in Full Name, Username, and Password.', 'warning');
      return;
    }

    if (typeof UI !== 'undefined' && typeof UI.showLoading === 'function') UI.showLoading();
    try {
      const res = await API.post('/users', {
        full_name: fullName,
        username: username,
        password: password,
        role: role,
        email: email,
        mobile_number: mobile
      });

      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
      if (res.success) {
        if (!this.userPasswords) this.userPasswords = {};
        this.userPasswords[username] = password;

        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(`User account '${username}' created successfully!`, 'success');
        const form = document.getElementById('sa-create-user-form');
        if (form) form.reset();
        
        // Reset card selection styling to default (OP Worker)
        const screenCards = document.querySelectorAll('.screen-select-card');
        screenCards.forEach(c => c.classList.remove('border-sky-500', 'bg-sky-500/10', 'ring-2', 'ring-sky-500'));
        if (screenCards[0]) screenCards[0].classList.add('border-sky-500', 'bg-sky-500/10', 'ring-2', 'ring-sky-500');
        const roleInput = document.getElementById('sa-user-role');
        if (roleInput) roleInput.value = 'OP Worker';

        this.fetchUsers();
      } else {
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(res.message || 'Failed to create user account.', 'error');
      }
    } catch (err) {
      if (typeof UI !== 'undefined' && typeof UI.hideLoading === 'function') UI.hideLoading();
      if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') UI.showToast(err.message || 'Server error while creating user.', 'error');
    }
  },

  async toggleUserStatus(userId, currentIsActive) {
    const newStatus = !currentIsActive;
    try {
      const res = await API.patch(`/users/${userId}/status`, { is_active: newStatus });
      if (res.success) {
        UI.showToast(res.message, 'success');
        this.fetchUsers();
        this.renderKPIs();
      } else {
        UI.showToast(res.message || 'Failed to toggle status.', 'error');
      }
    } catch (e) {
      UI.showToast(e.message || 'Error updating status.', 'error');
    }
  },

  openResetModal(userId, username) {
    this.activeUserId = userId;
    const modal = document.getElementById('sa-reset-modal');
    const userLabel = document.getElementById('sa-reset-username-label');
    const input = document.getElementById('sa-reset-new-password');

    if (userLabel) userLabel.textContent = username;
    if (input) input.value = '';

    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeResetModal() {
    const modal = document.getElementById('sa-reset-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.activeUserId = null;
  },

  async submitResetPassword() {
    if (!this.activeUserId) return;
    const newPassword = document.getElementById('sa-reset-new-password')?.value.trim();

    if (!newPassword) {
      UI.showToast('Please enter a new password.', 'warning');
      return;
    }

    try {
      const res = await API.post(`/users/${this.activeUserId}/reset-password`, { new_password: newPassword });
      if (res.success) {
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
           UI.showToast('Password reset successfully!', 'success');
        }
        this.closeResetModal();
        this.fetchUsers(); // Refresh the list so the new plain_password loads
      } else {
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
           UI.showToast(res.message || 'Failed to reset password.', 'error');
        }
      }
    } catch (e) {
      UI.showToast(e.message || 'Error resetting password.', 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SuperAdmin.init();
});

window.SuperAdmin = SuperAdmin;
