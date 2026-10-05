/* ==========================================================================
   MEDICINE & VENDOR INVENTORY MANAGEMENT MODULE
   ========================================================================== */

const Medicines = {
  list: [],
  vendorsList: [],
  purchasesList: [],
  returnsList: [],
  expiredDetails: null,
  editingId: null,
  importValidRows: [],
  activeTab: 'register',
  uploadedBillImageBase64: null,

  init() {
    this.bindEvents();
    this.bindTabs();
    this.loadMedicines();
    this.loadCategories();
    this.loadVendors();
  },

  bindTabs() {
    const tabs = [
      { id: 'register', btn: 'med-tab-register', section: 'med-section-register' },
      { id: 'purchases', btn: 'med-tab-purchases', section: 'med-section-purchases' },
      { id: 'returns', btn: 'med-tab-returns', section: 'med-section-returns' },
      { id: 'expired', btn: 'med-tab-expired', section: 'med-section-expired' }
    ];

    tabs.forEach(tab => {
      const btnElem = document.getElementById(tab.btn);
      if (!btnElem) return;

      btnElem.addEventListener('click', () => {
        this.activeTab = tab.id;
        tabs.forEach(t => {
          const b = document.getElementById(t.btn);
          const s = document.getElementById(t.section);
          if (!b || !s) return;

          if (t.id === tab.id) {
            b.className = 'sub-tab-btn active px-4 py-2 text-xs font-bold rounded-xl bg-sky-600 text-white shadow-sm flex items-center gap-2 transition-all';
            s.classList.remove('hidden');
          } else {
            b.className = 'sub-tab-btn px-4 py-2 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 flex items-center gap-2 transition-all';
            s.classList.add('hidden');
          }
        });

        if (tab.id === 'purchases') this.loadPurchases();
        if (tab.id === 'returns') this.loadReturns();
        if (tab.id === 'expired') this.loadExpiredDetails();
      });
    });
  },

  bindEvents() {
    const searchInput = document.getElementById('med-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.loadMedicines());
    }

    const categorySelect = document.getElementById('med-filter-category');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.loadMedicines());
    }

    const statusSelect = document.getElementById('med-filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this.loadMedicines());
    }

    // Medicine Form Submit
    const medForm = document.getElementById('form-medicine');
    if (medForm) {
      medForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMedicine();
      });
    }

    // Stock Adjustment Form Submit
    const stockForm = document.getElementById('form-stock-adjust');
    if (stockForm) {
      stockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveStockAdjustment();
      });
    }

    // Vendor Purchase Order Form Submit
    const vpForm = document.getElementById('form-vendor-purchase');
    if (vpForm) {
      vpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveVendorPurchase();
      });
    }

    // Purchase Return Form Submit
    const prForm = document.getElementById('form-purchase-return');
    if (prForm) {
      prForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.savePurchaseReturn();
      });
    }

    // Add Vendor Form Submit
    const addVendorForm = document.getElementById('form-add-vendor');
    if (addVendorForm) {
      addVendorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveVendor();
      });
    }

    // Dispose Expired Form Submit
    const disposeForm = document.getElementById('form-dispose-expired');
    if (disposeForm) {
      disposeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveExpiredDisposal();
      });
    }

    // Excel File Upload Input
    const fileInput = document.getElementById('excel-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.previewExcelImport(e.target.files[0]);
        }
      });
    }

    // Invoice Image Upload change preview
    const imageInput = document.getElementById('vp-invoice-image-file');
    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.uploadedBillImageBase64 = ev.target.result;
            const imgPreview = document.getElementById('vp-image-preview');
            const previewContainer = document.getElementById('vp-image-preview-container');
            if (imgPreview) imgPreview.src = ev.target.result;
            if (previewContainer) previewContainer.classList.remove('hidden');
          };
          reader.readAsDataURL(file);

          // Automatically parse image and update form fields on file select
          this.parseUploadedInvoiceImage();
        }
      });
    }
  },

  async parseUploadedInvoiceImage() {
    const imageInput = document.getElementById('vp-invoice-image-file');
    if (!imageInput || !imageInput.files || imageInput.files.length === 0) {
      UI.showToast('Please select an invoice image file first.', 'error');
      return;
    }

    const file = imageInput.files[0];
    const formData = new FormData();
    formData.append('invoice_image', file);

    try {
      UI.showToast('Parsing vendor invoice image...', 'info');
      const token = API.getToken();
      const response = await fetch(`${API.baseUrl}/medicines/vendors/parse-image`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const res = await response.json();
      if (res && res.success && res.parsed_data) {
        UI.showToast(res.message, 'success');
        const data = res.parsed_data;

        // Reload vendors list so newly auto-added vendor appears
        await this.loadVendors();

        const vendorSelect = document.getElementById('vp-vendor-select');
        if (vendorSelect) {
          vendorSelect.value = data.vendor_id;
        }

        const vendorNameInput = document.getElementById('vp-vendor-name');
        if (vendorNameInput) {
          vendorNameInput.value = data.vendor_name;
        }

        const invoiceNumInput = document.getElementById('vp-invoice-num');
        if (invoiceNumInput) invoiceNumInput.value = data.invoice_number;

        const dateInput = document.getElementById('vp-date');
        if (dateInput) dateInput.value = data.purchase_date;

        const statusElem = document.getElementById('vp-image-status');
        if (statusElem) {
          statusElem.textContent = `✓ Auto-filled: ${data.vendor_name}`;
          statusElem.classList.remove('hidden');
        }

      } else {
        UI.showToast(res?.message || 'Failed to parse invoice image', 'error');
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      UI.showToast('Error uploading & parsing image.', 'error');
    }
  },

  async loadMedicines() {
    try {
      const search = document.getElementById('med-search-input')?.value || '';
      const category = document.getElementById('med-filter-category')?.value || 'All';
      const status = document.getElementById('med-filter-status')?.value || '';

      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (category && category !== 'All') queryParams.append('category', category);
      if (status) queryParams.append('status', status);

      const res = await API.get(`/medicines?${queryParams.toString()}`);
      if (res.success) {
        this.list = res.medicines;
        this.renderTable();
      }
    } catch (error) {
      UI.showToast('Failed to load inventory medicines.', 'error');
    }
  },

  async loadCategories() {
    try {
      const res = await API.get('/medicines/categories');
      if (res.success) {
        const select = document.getElementById('med-filter-category');
        if (!select) return;
        select.innerHTML = '<option value="All">All Categories</option>';
        res.categories.forEach(cat => {
          select.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
      }
    } catch (error) {
      console.error(error);
    }
  },

  async loadVendors() {
    try {
      const res = await API.get('/medicines/vendors/list');
      if (res && res.success) {
        this.vendorsList = res.vendors || [];
        this.populateVendorDropdowns();
        this.renderVendorsDirectory();
      }
    } catch (error) {
      console.error('Failed to load vendors:', error);
    }
  },

  populateVendorDropdowns() {
    const vpSelect = document.getElementById('vp-vendor-select');
    const prSelect = document.getElementById('pr-vendor-select');
    const medSelect = document.getElementById('med-vendor-select');
    const importVendorSelect = document.getElementById('import-vendor-select');

    const optionsHtml = '<option value="">-- Choose Supplier / Vendor --</option>' + 
      this.vendorsList.map(v => `<option value="${v.id}" data-name="${this.escapeHtml(v.name)}">${v.name} (${v.phone || 'No phone'})</option>`).join('');

    if (vpSelect) {
      vpSelect.innerHTML = optionsHtml;
      vpSelect.onchange = (e) => {
        const selectedOpt = vpSelect.options[vpSelect.selectedIndex];
        const vName = selectedOpt.getAttribute('data-name') || (vpSelect.value ? selectedOpt.text.split('(')[0].trim() : '');
        const nameInput = document.getElementById('vp-vendor-name');
        if (nameInput) nameInput.value = vName;
      };
    }
    if (prSelect) prSelect.innerHTML = optionsHtml;
    if (medSelect) medSelect.innerHTML = optionsHtml;
    if (importVendorSelect) {
      importVendorSelect.innerHTML = '<option value="">-- Use Vendor Specified in Excel Rows --</option>' + 
        this.vendorsList.map(v => `<option value="${v.id}" data-name="${this.escapeHtml(v.name)}">${v.name} (${v.phone || 'No phone'})</option>`).join('');
    }
  },

  renderVendorsDirectory() {
    const tbody = document.getElementById('vendor-directory-body');
    if (!tbody) return;
    if (this.vendorsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-slate-500">No vendors registered yet. Add a vendor above.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.vendorsList.map(v => `
      <tr class="hover:bg-slate-50">
        <td class="p-2 font-bold text-slate-800">${this.escapeHtml(v.name)}</td>
        <td class="p-2 text-slate-600">${this.escapeHtml(v.contact_person || '--')}</td>
        <td class="p-2 text-slate-600 font-mono">${this.escapeHtml(v.phone || '--')}</td>
        <td class="p-2 text-slate-500 uppercase font-mono">${this.escapeHtml(v.gst_number || '--')}</td>
      </tr>
    `).join('');
  },

  async saveVendor() {
    try {
      const name = document.getElementById('v-name')?.value;
      const contact_person = document.getElementById('v-contact')?.value;
      const phone = document.getElementById('v-phone')?.value;
      const email = document.getElementById('v-email')?.value;
      const gst_number = document.getElementById('v-gst')?.value;

      if (!name || !name.trim()) {
        UI.showToast('Vendor firm name is required.', 'error');
        return;
      }

      const res = await API.post('/medicines/vendors/create', { name, contact_person, phone, email, gst_number });
      if (res && res.success) {
        UI.showToast(res.message || 'Vendor saved successfully!', 'success');
        document.getElementById('form-add-vendor')?.reset();
        this.loadVendors();
      } else {
        UI.showToast(res?.message || 'Failed to save vendor', 'error');
      }
    } catch (err) {
      UI.showToast(err.message || 'Error saving vendor', 'error');
    }
  },

  async loadPurchases() {
    try {
      const res = await API.get('/medicines/purchases/list');
      if (res && res.success) {
        this.purchasesList = res.purchases || [];
        this.renderPurchasesTable();
      }
    } catch (error) {
      console.error('Failed to load purchases:', error);
    }
  },

  renderPurchasesTable() {
    const tbody = document.getElementById('purchases-table-body');
    if (!tbody) return;

    if (this.purchasesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No vendor purchase orders recorded yet. Click "+ New Purchase Order" to inward stock.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.purchasesList.map(p => {
      const dateStr = new Date(p.created_at || p.purchase_date).toLocaleDateString();
      const itemCount = (p.items || []).length;
      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="p-3.5 font-mono font-bold text-emerald-700">${this.escapeHtml(p.purchase_number)}</td>
          <td class="p-3.5 font-bold text-slate-800">${this.escapeHtml(p.vendor_name)}</td>
          <td class="p-3.5 font-mono text-slate-600">${this.escapeHtml(p.invoice_number || '--')}</td>
          <td class="p-3.5 text-slate-600">${dateStr}</td>
          <td class="p-3.5 text-right font-black text-emerald-700">₹${Number(p.total_amount).toFixed(2)}</td>
          <td class="p-3.5 text-center">
            <span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">${p.payment_status}</span>
          </td>
          <td class="p-3.5 text-center font-bold text-sky-700">${itemCount} item(s)</td>
          <td class="p-3.5 text-slate-500 text-[11px]">${this.escapeHtml(p.created_by)}</td>
          <td class="p-3.5 text-center">
            <button onclick="Medicines.printPurchaseInvoice('${p.purchase_number}')" class="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer">
              🖨️ Print / Download PO
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openVendorPurchaseModal() {
    this.populateVendorDropdowns();
    this.populateMedicineDropdown('vp-med-select');
    this.uploadedBillImageBase64 = null;
    const vpDate = document.getElementById('vp-date');
    if (vpDate) vpDate.value = new Date().toISOString().split('T')[0];
    const previewContainer = document.getElementById('vp-image-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');
    const statusElem = document.getElementById('vp-image-status');
    if (statusElem) statusElem.classList.add('hidden');
    UI.openModal('modal-vendor-purchase');
  },

  populateMedicineDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose Medicine --</option>' + 
      this.list.map(m => `<option value="${m.id}" data-batch="${m.batch_number}" data-expiry="${m.expiry_date}" data-pprice="${m.purchase_price}" data-sprice="${m.selling_price}">${this.escapeHtml(m.name)} (Stock: ${m.current_stock})</option>`).join('');

    select.onchange = (e) => {
      const selected = select.options[select.selectedIndex];
      if (selectId === 'vp-med-select') {
        const batch = selected.getAttribute('data-batch') || '';
        const expiry = selected.getAttribute('data-expiry') || '';
        const pprice = selected.getAttribute('data-pprice') || '';
        const sprice = selected.getAttribute('data-sprice') || '';

        if (batch && document.getElementById('vp-batch')) document.getElementById('vp-batch').value = batch;
        if (expiry && document.getElementById('vp-expiry')) document.getElementById('vp-expiry').value = expiry;
        if (pprice && document.getElementById('vp-pprice')) document.getElementById('vp-pprice').value = pprice;
        if (sprice && document.getElementById('vp-sprice')) document.getElementById('vp-sprice').value = sprice;
      } else if (selectId === 'pr-med-select') {
        const pprice = selected.getAttribute('data-pprice') || '';
        if (pprice && document.getElementById('pr-price')) document.getElementById('pr-price').value = pprice;
      }
    };
  },

  async saveVendorPurchase() {
    try {
      const vendorSelect = document.getElementById('vp-vendor-select');
      const vendor_id = vendorSelect?.value;
      const nameInput = document.getElementById('vp-vendor-name')?.value;
      const vendor_name = (nameInput && nameInput.trim()) ? nameInput.trim() : (vendorSelect && vendorSelect.value ? vendorSelect.options[vendorSelect.selectedIndex].text.split('(')[0].trim() : '');
      const invoice_number = document.getElementById('vp-invoice-num')?.value;
      const purchase_date = document.getElementById('vp-date')?.value;
      const payment_status = document.getElementById('vp-payment-status')?.value || 'Paid';

      const medSelect = document.getElementById('vp-med-select');
      const medicine_id = medSelect?.value;
      const medicine_name = medSelect ? medSelect.options[medSelect.selectedIndex].text.split('(')[0].trim() : '';
      const batch_number = document.getElementById('vp-batch')?.value;
      const expiry_date = document.getElementById('vp-expiry')?.value;
      const quantity = document.getElementById('vp-quantity')?.value;
      const purchase_price = document.getElementById('vp-pprice')?.value;
      const selling_price = document.getElementById('vp-sprice')?.value;

      if (!vendor_id) {
        UI.showToast('Please select a vendor.', 'error');
        return;
      }
      if (!medicine_id) {
        UI.showToast('Please select a medicine.', 'error');
        return;
      }
      if (!quantity || quantity <= 0) {
        UI.showToast('Inward quantity must be greater than 0.', 'error');
        return;
      }

      const payload = {
        vendor_id,
        vendor_name,
        invoice_number,
        purchase_date,
        payment_status,
        bill_image: this.uploadedBillImageBase64 || null,
        items: [
          {
            medicine_id,
            medicine_name,
            batch_number,
            expiry_date,
            quantity: parseInt(quantity, 10),
            purchase_price: parseFloat(purchase_price),
            selling_price: parseFloat(selling_price)
          }
        ]
      };

      const res = await API.post('/medicines/purchases/create', payload);
      if (res && res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-vendor-purchase');
        document.getElementById('form-vendor-purchase')?.reset();
        this.loadMedicines();
        this.loadPurchases();

        if (res.purchase_number) {
          this.printPurchaseInvoice(res.purchase_number);
        }
      } else {
        UI.showToast(res?.message || 'Failed to record purchase', 'error');
      }
    } catch (err) {
      UI.showToast(err.message || 'Error recording vendor purchase', 'error');
    }
  },

  async loadReturns() {
    try {
      const res = await API.get('/medicines/returns/list');
      if (res && res.success) {
        this.returnsList = res.returns || [];
        this.renderReturnsTable();
      }
    } catch (error) {
      console.error('Failed to load purchase returns:', error);
    }
  },

  renderReturnsTable() {
    const tbody = document.getElementById('returns-table-body');
    if (!tbody) return;

    if (this.returnsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No purchase returns recorded yet. Click "+ New Purchase Return" to return stock to vendors.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.returnsList.map(r => {
      const dateStr = new Date(r.created_at || r.return_date).toLocaleDateString();
      const itemCount = (r.items || []).length;
      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="p-3.5 font-mono font-bold text-amber-700">${this.escapeHtml(r.return_number)}</td>
          <td class="p-3.5 font-bold text-slate-800">${this.escapeHtml(r.vendor_name)}</td>
          <td class="p-3.5 font-mono text-slate-600">${this.escapeHtml(r.purchase_number || '--')}</td>
          <td class="p-3.5 text-slate-600">${dateStr}</td>
          <td class="p-3.5 text-slate-700 font-semibold">${this.escapeHtml(r.return_reason)}</td>
          <td class="p-3.5 text-right font-black text-amber-700">₹${Number(r.total_refund_amount).toFixed(2)}</td>
          <td class="p-3.5 text-center font-bold text-amber-700">${itemCount} item(s)</td>
          <td class="p-3.5 text-slate-500 text-[11px]">${this.escapeHtml(r.created_by)}</td>
          <td class="p-3.5 text-center">
            <button onclick="Medicines.printReturnVoucher('${r.return_number}')" class="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer">
              🖨️ Print PR Voucher
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openPurchaseReturnModal(prefilledMedId = null, prefilledReason = 'Expired Stock Return') {
    this.populateVendorDropdowns();
    this.populateMedicineDropdown('pr-med-select');

    if (prefilledMedId) {
      const medSelect = document.getElementById('pr-med-select');
      if (medSelect) {
        medSelect.value = prefilledMedId;
        medSelect.dispatchEvent(new Event('change'));
      }
    }

    if (prefilledReason) {
      const reasonElem = document.getElementById('pr-reason');
      if (reasonElem) reasonElem.value = prefilledReason;
    }

    UI.openModal('modal-purchase-return');
  },

  async savePurchaseReturn() {
    try {
      const vendorSelect = document.getElementById('pr-vendor-select');
      const vendor_id = vendorSelect?.value;
      const vendor_name = vendorSelect ? vendorSelect.options[vendorSelect.selectedIndex].text.split('(')[0].trim() : '';
      const purchase_number = document.getElementById('pr-po-num')?.value;
      const return_reason = document.getElementById('pr-reason')?.value;

      const medSelect = document.getElementById('pr-med-select');
      const medicine_id = medSelect?.value;
      const medicine_name = medSelect ? medSelect.options[medSelect.selectedIndex].text.split('(')[0].trim() : '';
      const quantity = document.getElementById('pr-quantity')?.value;
      const unit_price = document.getElementById('pr-price')?.value;

      if (!vendor_name) {
        UI.showToast('Please select a vendor.', 'error');
        return;
      }
      if (!medicine_id) {
        UI.showToast('Please select a medicine.', 'error');
        return;
      }
      if (!quantity || quantity <= 0) {
        UI.showToast('Return quantity must be greater than 0.', 'error');
        return;
      }

      const payload = {
        vendor_id,
        vendor_name,
        purchase_number,
        return_reason,
        items: [
          {
            medicine_id,
            medicine_name,
            quantity: parseInt(quantity, 10),
            unit_price: parseFloat(unit_price)
          }
        ]
      };

      const res = await API.post('/medicines/returns/create', payload);
      if (res && res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-purchase-return');
        document.getElementById('form-purchase-return')?.reset();
        this.loadMedicines();
        this.loadReturns();
        this.loadExpiredDetails();

        if (res.return_number) {
          this.printReturnVoucher(res.return_number);
        }
      } else {
        UI.showToast(res?.message || 'Failed to record return', 'error');
      }
    } catch (err) {
      UI.showToast(err.message || 'Error recording purchase return', 'error');
    }
  },

  async loadExpiredDetails() {
    try {
      const res = await API.get('/medicines/expired/details');
      if (res && res.success) {
        this.expiredDetails = res;
        this.renderExpiredSection();
      }
    } catch (error) {
      console.error('Failed to load expired details:', error);
    }
  },

  renderExpiredSection() {
    if (!this.expiredDetails) return;
    const { total_expired_count, total_expired_units, total_loss_value, expired_medicines, disposals_history } = this.expiredDetails;

    const countElem = document.getElementById('stat-expired-count');
    const unitsElem = document.getElementById('stat-expired-units');
    const valueElem = document.getElementById('stat-expired-value');

    if (countElem) countElem.textContent = total_expired_count;
    if (unitsElem) unitsElem.textContent = total_expired_units;
    if (valueElem) valueElem.textContent = `₹${Number(total_loss_value).toFixed(2)}`;

    const expiredTbody = document.getElementById('expired-table-body');
    if (expiredTbody) {
      if (!expired_medicines || expired_medicines.length === 0) {
        expiredTbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-emerald-600 font-bold">🎉 Great news! No expired medicines currently in stock.</td></tr>`;
      } else {
        expiredTbody.innerHTML = expired_medicines.map(m => `
          <tr class="hover:bg-rose-50/50 border-b border-slate-100">
            <td class="p-3.5 font-bold text-slate-500">#${m.id}</td>
            <td class="p-3.5">
              <span class="font-extrabold text-slate-900 block">${this.escapeHtml(m.name)}</span>
              <span class="text-[11px] text-slate-500">${this.escapeHtml(m.generic_name)}</span>
            </td>
            <td class="p-3.5 font-bold text-slate-800">
              🏬 ${this.escapeHtml(m.vendor_name || 'Unassigned Vendor')}
            </td>
            <td class="p-3.5 text-slate-600">${this.escapeHtml(m.manufacturer || '--')}</td>
            <td class="p-3.5 font-mono text-slate-700 font-bold">${this.escapeHtml(m.batch_number)}</td>
            <td class="p-3.5 font-bold text-rose-600">${m.expiry_date}</td>
            <td class="p-3.5 text-center font-black text-rose-700">${m.current_stock}</td>
            <td class="p-3.5 text-right font-semibold text-slate-700">₹${Number(m.purchase_price).toFixed(2)}</td>
            <td class="p-3.5 text-right font-black text-rose-700">₹${Number(m.total_loss_value).toFixed(2)}</td>
            <td class="p-3.5 text-center">
              <div class="flex items-center justify-center gap-1.5">
                <button onclick="Medicines.openPurchaseReturnModal(${m.id}, 'Expired Stock Return')" class="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors cursor-pointer">
                  ↩️ Return to Vendor
                </button>
                <button onclick="Medicines.openDisposeModal(${m.id}, '${this.escapeHtml(m.name)}', '${this.escapeHtml(m.batch_number)}', '${m.expiry_date}', ${m.current_stock})" class="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-lg transition-colors cursor-pointer">
                  🗑️ Dispose / Write-off
                </button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    }

    const disposalsTbody = document.getElementById('disposals-table-body');
    if (disposalsTbody) {
      if (!disposals_history || disposals_history.length === 0) {
        disposalsTbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No expired stock disposals logged yet.</td></tr>`;
      } else {
        disposalsTbody.innerHTML = disposals_history.map(d => {
          const dateStr = new Date(d.created_at).toLocaleDateString();
          return `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
              <td class="p-3.5 font-mono font-bold text-slate-700">${this.escapeHtml(d.disposal_number)}</td>
              <td class="p-3.5 font-bold text-slate-900">${this.escapeHtml(d.medicine_name)}</td>
              <td class="p-3.5 font-mono text-slate-600">${this.escapeHtml(d.batch_number || '--')}</td>
              <td class="p-3.5 text-slate-600">${d.expiry_date || '--'}</td>
              <td class="p-3.5 text-center font-bold text-rose-600">${d.quantity}</td>
              <td class="p-3.5 text-right font-black text-rose-700">₹${Number(d.loss_amount).toFixed(2)}</td>
              <td class="p-3.5 text-slate-700">${this.escapeHtml(d.reason)}</td>
              <td class="p-3.5 text-slate-500 text-[11px]">${this.escapeHtml(d.user_name)}</td>
              <td class="p-3.5 text-slate-500 text-[11px]">${dateStr}</td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  openDisposeModal(medId, medName, batch, expiry, currentStock) {
    document.getElementById('dispose-med-id').value = medId;
    document.getElementById('dispose-med-name').textContent = medName;
    document.getElementById('dispose-med-batch').textContent = batch || 'N/A';
    document.getElementById('dispose-med-expiry').textContent = expiry || 'Expired';
    document.getElementById('dispose-med-stock').textContent = currentStock;

    const qtyInput = document.getElementById('dispose-qty');
    if (qtyInput) {
      qtyInput.value = currentStock;
      qtyInput.max = currentStock;
    }

    UI.openModal('modal-dispose-expired');
  },

  async saveExpiredDisposal() {
    try {
      const medicine_id = document.getElementById('dispose-med-id')?.value;
      const quantity = document.getElementById('dispose-qty')?.value;
      const reason = document.getElementById('dispose-reason')?.value;

      if (!medicine_id) {
        UI.showToast('Invalid medicine selected.', 'error');
        return;
      }

      const res = await API.post('/medicines/expired/dispose', {
        medicine_id,
        quantity: parseInt(quantity, 10),
        reason
      });

      if (res && res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-dispose-expired');
        this.loadMedicines();
        this.loadExpiredDetails();
      } else {
        UI.showToast(res?.message || 'Failed to dispose expired stock', 'error');
      }
    } catch (err) {
      UI.showToast(err.message || 'Error disposing expired stock', 'error');
    }
  },

  openVendorManageModal() {
    this.loadVendors();
    UI.openModal('modal-vendor-manage');
  },

  // =========================================================================
  // PRINT / DOWNLOAD REPORT FUNCTIONS
  // =========================================================================

  getDoctorHeaderHtml(title = 'PHARMACY & VENDOR INVENTORY MANAGEMENT') {
    return `
      <div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 22px; font-weight: 800; color: #0284c7; letter-spacing: -0.5px;">ORTHOFIX SPECIALITY CLINIC</div>
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">Pharmacy & Vendor Inventory Department</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase;">${title}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Date: <strong>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong></div>
        </div>
      </div>
    `;
  },

  printPurchaseInvoice(poNumber) {
    const p = this.purchasesList.find(x => x.purchase_number === poNumber);
    if (!p) {
      UI.showToast('Purchase record not found.', 'error');
      return;
    }

    const v = this.vendorsList.find(v => v.id === p.vendor_id || v.name === p.vendor_name) || {};

    const printWin = window.open('', '_blank', 'width=850,height=800');
    if (!printWin) {
      UI.showToast('Please allow popups to print Purchase Order.', 'error');
      return;
    }

    const itemsHtml = (p.items || []).map((item, idx) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: center;">${idx + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
          <strong style="color: #0f172a; font-size: 13px;">${this.escapeHtml(item.medicine_name)}</strong>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700;">${this.escapeHtml(item.batch_number || 'N/A')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${item.expiry_date || 'N/A'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: #0284c7;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${Number(item.purchase_price).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${Number(item.selling_price || item.purchase_price * 1.3).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #0f172a;">₹${Number(item.total_price).toFixed(2)}</td>
      </tr>
    `).join('');

    const invoiceHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Vendor Purchase Order ${p.purchase_number}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@700&display=swap');
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #0f172a; padding: 24px; }
          .invoice-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th { background: #f1f5f9; text-align: left; padding: 10px; font-weight: 800; border-bottom: 2px solid #cbd5e1; color: #334155; }
          .total-box { text-align: right; font-size: 16px; font-weight: 800; color: #0369a1; border-top: 2px solid #0284c7; padding-top: 12px; }
          .footer { margin-top: 40px; border-top: 1px border-dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${this.getDoctorHeaderHtml(`INWARD PURCHASE ORDER: ${p.purchase_number}`)}

        <div class="invoice-box">
          <div>
            <strong style="color: #0284c7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Vendor / Supplier Details:</strong><br>
            <span style="font-size: 15px; font-weight: 800; color: #0f172a; display: block; margin-top: 2px;">${this.escapeHtml(p.vendor_name)}</span>
            Contact Person: <strong>${this.escapeHtml(v.contact_person || 'Sales Manager')}</strong><br>
            Phone / Contact: <strong>${this.escapeHtml(v.phone || '+91 98900 11223')}</strong><br>
            GST Registration #: <strong>${this.escapeHtml(v.gst_number || '27AAAC1234H1Z5')}</strong><br>
            Vendor Address: <strong>${this.escapeHtml(v.address || 'Pharma Wholesale Hub')}</strong>
          </div>
          <div style="text-align: right;">
            <strong style="color: #0284c7; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Purchase Order Summary:</strong><br>
            PO Reference #: <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #0284c7; font-size: 14px;">${p.purchase_number}</span><br>
            Vendor Bill / Invoice #: <strong>${this.escapeHtml(p.invoice_number || 'N/A')}</strong><br>
            Purchase Entry Date: <strong>${new Date(p.created_at || p.purchase_date).toLocaleDateString()}</strong><br>
            Payment Status: <strong style="color: #15803d; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">${p.payment_status}</strong><br>
            Recorded By Staff: <strong>${this.escapeHtml(p.created_by)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Medicine Name</th>
              <th>Batch #</th>
              <th>Expiry</th>
              <th style="text-align: center;">Inward Qty</th>
              <th style="text-align: right;">Purchase Rate (₹)</th>
              <th style="text-align: right;">Selling Rate (₹)</th>
              <th style="text-align: right;">Subtotal (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-box">
          Grand Total Vendor Purchase Amount: ₹${Number(p.total_amount).toFixed(2)}
        </div>

        ${p.bill_image ? `
        <div style="margin-top: 20px; page-break-before: auto;">
          <strong style="font-size: 12px; color: #0f172a;">Attached Original Vendor Invoice Photo / Receipt:</strong><br>
          <img src="${p.bill_image}" style="max-width: 100%; max-height: 250px; border-radius: 8px; border: 1px solid #cbd5e1; margin-top: 8px;">
        </div>
        ` : ''}

        <div class="footer">
          <div>
            Verified / Received By Sign: _____________________<br>
            <span style="font-size: 10px; color: #94a3b8;">Inventory Store Incharge</span>
          </div>
          <div style="text-align: right;">
            Authorized Signature: _____________________<br>
            <span style="font-size: 10px; color: #94a3b8;">Hospital Authority Stamp</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.write(invoiceHtml);
    printWin.document.close();
  },

  printReturnVoucher(returnNumber) {
    const r = this.returnsList.find(x => x.return_number === returnNumber);
    if (!r) {
      UI.showToast('Return record not found.', 'error');
      return;
    }

    const v = this.vendorsList.find(v => v.id === r.vendor_id || v.name === r.vendor_name) || {};

    const printWin = window.open('', '_blank', 'width=850,height=750');
    if (!printWin) {
      UI.showToast('Please allow popups to print Return Voucher.', 'error');
      return;
    }

    const itemsHtml = (r.items || []).map((item, idx) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong style="font-size: 13px; color: #0f172a;">${this.escapeHtml(item.medicine_name)}</strong></td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700;">${this.escapeHtml(item.batch_number || '--')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: #b45309;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${Number(item.unit_price).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 800; color: #b45309;">₹${Number(item.total_refund).toFixed(2)}</td>
      </tr>
    `).join('');

    const voucherHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Return Voucher ${r.return_number}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@700&display=swap');
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #0f172a; padding: 24px; }
          .box { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          th { background: #fef3c7; text-align: left; padding: 10px; font-weight: 800; border-bottom: 2px solid #fde68a; color: #78350f; }
          .total-box { text-align: right; font-size: 16px; font-weight: 800; color: #b45309; border-top: 2px solid #d97706; padding-top: 12px; }
          .footer { margin-top: 40px; border-top: 1px border-dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${this.getDoctorHeaderHtml(`PURCHASE RETURN CREDIT VOUCHER: ${r.return_number}`)}

        <div class="box">
          <div>
            <strong style="color: #b45309; font-size: 11px; text-transform: uppercase;">Returned to Vendor Firm:</strong><br>
            <span style="font-size: 15px; font-weight: 800; color: #0f172a; display: block; margin-top: 2px;">${this.escapeHtml(r.vendor_name)}</span>
            Contact Person: <strong>${this.escapeHtml(v.contact_person || 'Sales Rep')}</strong><br>
            Phone / Contact: <strong>${this.escapeHtml(v.phone || 'N/A')}</strong><br>
            GST Number: <strong>${this.escapeHtml(v.gst_number || 'N/A')}</strong>
          </div>
          <div style="text-align: right;">
            <strong style="color: #b45309; font-size: 11px; text-transform: uppercase;">Return Note Details:</strong><br>
            Return Voucher #: <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #d97706; font-size: 14px;">${r.return_number}</span><br>
            Original Purchase PO #: <strong>${this.escapeHtml(r.purchase_number || 'N/A')}</strong><br>
            Return Date: <strong>${new Date(r.created_at || r.return_date).toLocaleDateString()}</strong><br>
            Reason for Return: <strong style="color: #b45309;">${this.escapeHtml(r.return_reason)}</strong><br>
            Authorized Staff: <strong>${this.escapeHtml(r.created_by)}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Medicine Name</th>
              <th>Batch #</th>
              <th style="text-align: center;">Returned Qty</th>
              <th style="text-align: right;">Unit Rate (₹)</th>
              <th style="text-align: right;">Total Refund Claim (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="total-box">
          Total Vendor Refund Amount Claimed: ₹${Number(r.total_refund_amount).toFixed(2)}
        </div>

        <div class="footer">
          <div>
            Authorized Return Sign: _____________________<br>
            <span style="font-size: 10px; color: #94a3b8;">Inventory Store Manager</span>
          </div>
          <div style="text-align: right;">
            Vendor Acknowledgment Sign: _____________________<br>
            <span style="font-size: 10px; color: #94a3b8;">Supplier Representative Receipt Stamp</span>
          </div>
        </div>

        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 300); };
        </script>
      </body>
      </html>
    `;

    printWin.document.write(voucherHtml);
    printWin.document.close();
  },

  printPurchasesSummary() {
    this.printReportTable('VENDOR PURCHASE ORDERS SUMMARY REPORT', this.purchasesList, [
      { label: 'PO #', field: p => p.purchase_number },
      { label: 'Vendor Name', field: p => p.vendor_name },
      { label: 'Invoice #', field: p => p.invoice_number || '--' },
      { label: 'Date', field: p => new Date(p.created_at || p.purchase_date).toLocaleDateString() },
      { label: 'Status', field: p => p.payment_status },
      { label: 'Items', field: p => `${(p.items || []).length} item(s)` },
      { label: 'Total Amount', field: p => `₹${Number(p.total_amount).toFixed(2)}`, align: 'right' }
    ]);
  },

  printReturnsSummary() {
    this.printReportTable('PURCHASE RETURNS TO VENDORS REPORT', this.returnsList, [
      { label: 'PR #', field: r => r.return_number },
      { label: 'Vendor Name', field: r => r.vendor_name },
      { label: 'Ref PO #', field: r => r.purchase_number || '--' },
      { label: 'Return Date', field: r => new Date(r.created_at || r.return_date).toLocaleDateString() },
      { label: 'Reason', field: r => r.return_reason },
      { label: 'Refund Amount', field: r => `₹${Number(r.total_refund_amount).toFixed(2)}`, align: 'right' }
    ]);
  },

  printExpiredReport() {
    const expiredList = (this.expiredDetails && this.expiredDetails.expired_medicines) ? this.expiredDetails.expired_medicines : [];
    this.printReportTable('EXPIRED MEDICINE STOCK & LOSS AUDIT REPORT', expiredList, [
      { label: 'ID', field: m => `#${m.id}` },
      { label: 'Medicine Name', field: m => m.name },
      { label: 'Generic', field: m => m.generic_name },
      { label: 'Manufacturer', field: m => m.manufacturer || '--' },
      { label: 'Batch #', field: m => m.batch_number },
      { label: 'Expiry Date', field: m => m.expiry_date },
      { label: 'Stock Units', field: m => m.current_stock, align: 'center' },
      { label: 'Purchase Rate', field: m => `₹${Number(m.purchase_price).toFixed(2)}`, align: 'right' },
      { label: 'Total Loss Value', field: m => `₹${Number(m.total_loss_value).toFixed(2)}`, align: 'right' }
    ]);
  },

  printReportTable(title, dataList, columns) {
    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (!printWin) {
      UI.showToast('Please allow popups to print report.', 'error');
      return;
    }

    const rowsHtml = (dataList || []).map((item, idx) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; text-align: center;">${idx + 1}</td>
        ${columns.map(col => `
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; ${col.align ? `text-align: ${col.align};` : ''}">
            ${this.escapeHtml(String(col.field(item)))}
          </td>
        `).join('')}
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: #fff; color: #0f172a; padding: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
          th { background: #f1f5f9; text-align: left; padding: 8px; font-weight: 800; border-bottom: 2px solid #cbd5e1; }
          .footer { margin-top: 30px; border-top: 1px border-dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${this.getDoctorHeaderHtml(title)}
        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              ${columns.map(col => `<th style="${col.align ? `text-align: ${col.align};` : ''}">${col.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="10" style="padding: 16px; text-align: center;">No records found.</td></tr>'}
          </tbody>
        </table>
        <div class="footer">
          <div>Authorized Signature: _____________________</div>
          <div>Page 1 of 1</div>
        </div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 300); };
        </script>
      </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
  },

  renderTable() {
    const tbody = document.getElementById('medicines-table-body');
    if (!tbody) return;

    if (this.list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-500">No medicines found matching the current search criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.list.map(m => {
      let statusBadge = '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">IN STOCK</span>';
      if (m.stock_status === 'EXPIRED') {
        statusBadge = '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">EXPIRED</span>';
      } else if (m.stock_status === 'OUT OF STOCK') {
        statusBadge = '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-100 text-rose-800 border border-rose-200">OUT OF STOCK</span>';
      } else if (m.stock_status === 'LOW STOCK') {
        statusBadge = '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-amber-100 text-amber-800 border border-amber-200">LOW STOCK</span>';
      }

      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="px-2 py-2 font-bold text-slate-500">#${m.id}</td>
          <td class="px-2 py-2">
            <span class="font-extrabold text-slate-900 block">${this.escapeHtml(m.name)}</span>
            <span class="text-[11px] text-slate-500">${this.escapeHtml(m.generic_name)}</span>
          </td>
          <td class="px-2 py-2">
            <span class="font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 text-xs block truncate max-w-[120px]" title="${this.escapeHtml(m.vendor_name || 'Unassigned')}">
              🏬 ${this.escapeHtml(m.vendor_name || 'Unassigned Vendor')}
            </span>
          </td>
          <td class="px-2 py-2"><span class="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md text-[10px]">${this.escapeHtml(m.category)}</span></td>
          <td class="px-2 py-2 font-mono text-slate-700 font-bold">${this.escapeHtml(m.batch_number)}</td>
          <td class="px-2 py-2 font-semibold ${m.is_expired ? 'text-rose-600 font-bold' : 'text-slate-600'}">${m.expiry_date}</td>
          <td class="px-2 py-2 text-right font-semibold text-slate-700">₹${Number(m.purchase_price).toFixed(2)}</td>
          <td class="px-2 py-2 text-right font-bold text-slate-800">₹${Number(m.selling_price).toFixed(2)}</td>
          <td class="px-2 py-2 text-right font-black text-emerald-700">
            ₹${((Number(m.selling_price) || 0) / (m.units_per_strip || 10)).toFixed(2)}
          </td>
          <td class="px-2 py-2 text-center font-bold text-slate-800 text-xs">
            ${m.units_per_strip || 10}
          </td>
          <td class="px-2 py-2 text-center font-black text-slate-900 text-sm">${m.current_stock}</td>
          <td class="px-2 py-2 text-center">${statusBadge}</td>
          <td class="px-2 py-2 text-center">
            <div class="flex items-center justify-center gap-1">
              <button onclick="Medicines.openStockModal(${m.id})" title="Adjust Stock" class="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              </button>
              <button onclick="Medicines.openEditModal(${m.id})" title="Edit Medicine" class="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button onclick="Medicines.deleteMedicine(${m.id}, '${this.escapeHtml(m.name)}')" title="Delete Medicine" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddModal() {
    this.editingId = null;
    this.populateVendorDropdowns();
    document.getElementById('modal-med-title').textContent = 'Add New Medicine';
    document.getElementById('form-medicine').reset();
    document.getElementById('med-id-hidden').value = '';
    const unitsInput = document.getElementById('med-units-per-strip');
    if (unitsInput) unitsInput.value = '10';
    UI.openModal('modal-medicine');
  },

  openEditModal(id) {
    const med = this.list.find(m => m.id === id);
    if (!med) return;

    this.editingId = id;
    this.populateVendorDropdowns();
    document.getElementById('modal-med-title').textContent = `Edit Medicine: ${med.name}`;
    document.getElementById('med-id-hidden').value = med.id;
    document.getElementById('med-name').value = med.name;
    document.getElementById('med-generic').value = med.generic_name;
    document.getElementById('med-category').value = med.category;
    document.getElementById('med-manufacturer').value = med.manufacturer || '';
    const medVendorSelect = document.getElementById('med-vendor-select');
    if (medVendorSelect) medVendorSelect.value = med.vendor_id || '';
    document.getElementById('med-batch').value = med.batch_number;
    document.getElementById('med-expiry').value = med.expiry_date;
    document.getElementById('med-pprice').value = med.purchase_price;
    document.getElementById('med-sprice').value = med.selling_price;
    const unitsInput = document.getElementById('med-units-per-strip');
    if (unitsInput) unitsInput.value = med.units_per_strip || 10;
    document.getElementById('med-stock').value = med.current_stock;
    document.getElementById('med-minstock').value = med.minimum_stock;
    document.getElementById('med-gst').value = med.gst_percent || 12.0;
    document.getElementById('med-barcode').value = med.barcode || '';
    document.getElementById('med-desc').value = med.description || '';

    UI.openModal('modal-medicine');
  },

  async saveMedicine() {
    try {
      const vendorSelect = document.getElementById('med-vendor-select');
      const vendor_id = vendorSelect?.value || null;
      const vendor_name = (vendorSelect && vendorSelect.selectedIndex > 0) ? vendorSelect.options[vendorSelect.selectedIndex].text.split('(')[0].trim() : '';

      const payload = {
        name: document.getElementById('med-name').value,
        generic_name: document.getElementById('med-generic').value,
        category: document.getElementById('med-category').value,
        manufacturer: document.getElementById('med-manufacturer').value,
        vendor_id: vendor_id ? parseInt(vendor_id, 10) : null,
        vendor_name: vendor_name,
        batch_number: document.getElementById('med-batch').value,
        expiry_date: document.getElementById('med-expiry').value,
        purchase_price: document.getElementById('med-pprice').value,
        selling_price: document.getElementById('med-sprice').value,
        units_per_strip: document.getElementById('med-units-per-strip')?.value || 10,
        current_stock: document.getElementById('med-stock').value,
        minimum_stock: document.getElementById('med-minstock').value,
        gst_percent: document.getElementById('med-gst').value,
        barcode: document.getElementById('med-barcode').value,
        description: document.getElementById('med-desc').value
      };

      let res;
      if (this.editingId) {
        res = await API.put(`/medicines/${this.editingId}`, payload);
      } else {
        res = await API.post('/medicines', payload);
      }

      if (res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-medicine');
        this.loadMedicines();
        this.loadCategories();
      } else {
        UI.showToast(res.message || 'Failed to save medicine.', 'error');
      }
    } catch (error) {
      UI.showToast(error.message || 'Error saving medicine.', 'error');
    }
  },

  openStockModal(id) {
    const med = this.list.find(m => m.id === id);
    if (!med) return;

    document.getElementById('stock-med-id').value = med.id;
    document.getElementById('stock-med-name').textContent = med.name;
    document.getElementById('stock-med-current').textContent = med.current_stock;
    document.getElementById('stock-change-qty').value = '';
    document.getElementById('stock-reason').value = '';

    UI.openModal('modal-stock');
  },

  async saveStockAdjustment() {
    try {
      const id = document.getElementById('stock-med-id').value;
      const changeQty = document.getElementById('stock-change-qty').value;
      const reason = document.getElementById('stock-reason').value;

      const res = await API.post(`/medicines/${id}/stock`, {
        change_quantity: parseInt(changeQty, 10),
        reason
      });

      if (res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-stock');
        this.loadMedicines();
      } else {
        UI.showToast(res.message || 'Failed to adjust stock.', 'error');
      }
    } catch (error) {
      UI.showToast(error.message || 'Error adjusting stock.', 'error');
    }
  },

  async deleteMedicine(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}" from inventory? This action cannot be undone.`)) return;

    try {
      const res = await API.delete(`/medicines/${id}`);
      if (res.success) {
        UI.showToast(res.message, 'success');
        this.loadMedicines();
      } else {
        UI.showToast(res.message || 'Failed to delete medicine.', 'error');
      }
    } catch (error) {
      UI.showToast(error.message || 'Error deleting medicine.', 'error');
    }
  },

  openImportModal() {
    this.populateVendorDropdowns();
    document.getElementById('excel-file-input').value = '';
    document.getElementById('import-preview-section').classList.add('hidden');
    document.getElementById('btn-confirm-import').disabled = true;
    const importVendorSelect = document.getElementById('import-vendor-select');
    if (importVendorSelect) importVendorSelect.value = '';
    this.importValidRows = [];
    UI.openModal('modal-import-excel');
  },

  downloadTemplate() {
    const templateData = [
      {
        'Medicine Name': 'Paracetamol 500mg',
        'Generic Name': 'Acetaminophen',
        'Vendor Name': 'Cipla Pharma Distributors',
        'Category': 'Analgesics',
        'Manufacturer': 'Cipla Ltd',
        'Batch Number': 'PCM2026A',
        'Expiry Date (YYYY-MM-DD)': '2027-12-31',
        'Purchase Price': 6.00,
        'Selling Price': 10.00,
        'Units Per Strip': 10,
        'Initial Stock': 50,
        'Minimum Stock': 10,
        'GST Percent': 12.00,
        'Barcode': '8901234567890',
        'Description': 'Pain reliever and fever reducer'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MedicineTemplate');
    XLSX.writeFile(wb, 'Orthofix_Medicine_Import_Template.xlsx');
  },

  previewExcelImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (!rows || rows.length === 0) {
          UI.showToast('Uploaded Excel file contains no data.', 'error');
          return;
        }

        const previewTbody = document.getElementById('import-preview-table-body');
        const summaryCounts = document.getElementById('import-summary-counts');
        const btnConfirm = document.getElementById('btn-confirm-import');

        previewTbody.innerHTML = '';
        this.importValidRows = [];
        let validCount = 0;
        let invalidCount = 0;

        const selectedVendorElem = document.getElementById('import-vendor-select');
        const defaultVendorName = (selectedVendorElem && selectedVendorElem.selectedIndex > 0) ? selectedVendorElem.options[selectedVendorElem.selectedIndex].text.split('(')[0].trim() : '';

        rows.forEach((row, index) => {
          const rowNum = index + 2;
          const name = row['Medicine Name'] || row['name'] || '';
          const generic = row['Generic Name'] || row['generic_name'] || '';
          const excelVendor = row['Vendor Name'] || row['vendor_name'] || row['Vendor'] || '';
          const vendorName = defaultVendorName || excelVendor;
          const category = row['Category'] || row['category'] || '';
          const batch = row['Batch Number'] || row['batch_number'] || '';
          const expiry = row['Expiry Date (YYYY-MM-DD)'] || row['Expiry Date'] || row['expiry_date'] || '';
          const pprice = parseFloat(row['Purchase Price'] || row['purchase_price'] || 0);
          const sprice = parseFloat(row['Selling Price'] || row['selling_price'] || 0);
          const unitsPerStrip = parseInt(row['Units Per Strip'] || row['units_per_strip'] || row['Pack Size'] || 10, 10);
          const stock = parseInt(row['Initial Stock'] || row['Current Stock'] || row['current_stock'] || 0, 10);
          const minstock = parseInt(row['Minimum Stock'] || row['minimum_stock'] || 10, 10);

          let isValid = true;
          let errors = [];

          if (!name) { isValid = false; errors.push('Missing Name'); }
          if (!generic) { isValid = false; errors.push('Missing Generic'); }
          if (!category) { isValid = false; errors.push('Missing Category'); }
          if (!batch) { isValid = false; errors.push('Missing Batch'); }
          if (!expiry) { isValid = false; errors.push('Missing Expiry'); }
          if (isNaN(pprice) || pprice <= 0) { isValid = false; errors.push('Invalid Purchase Price'); }
          if (isNaN(sprice) || sprice <= 0) { isValid = false; errors.push('Invalid Selling Price'); }

          if (isValid) {
            validCount++;
            this.importValidRows.push({
              name,
              generic_name: generic,
              vendor_name: vendorName,
              category,
              manufacturer: row['Manufacturer'] || row['manufacturer'] || '',
              batch_number: String(batch),
              expiry_date: String(expiry),
              purchase_price: pprice,
              selling_price: sprice,
              units_per_strip: isNaN(unitsPerStrip) || unitsPerStrip <= 0 ? 10 : unitsPerStrip,
              current_stock: isNaN(stock) ? 0 : stock,
              minimum_stock: isNaN(minstock) ? 10 : minstock,
              gst_percent: parseFloat(row['GST Percent'] || row['gst_percent'] || 12.0),
              barcode: row['Barcode'] ? String(row['Barcode']) : '',
              description: row['Description'] || ''
            });
          } else {
            invalidCount++;
          }

          const tr = document.createElement('tr');
          tr.className = isValid ? 'bg-emerald-50/50' : 'bg-rose-50/60';
          tr.innerHTML = `
            <td class="p-2 font-bold">${rowNum}</td>
            <td class="p-2 font-bold">${this.escapeHtml(name)}</td>
            <td class="p-2 font-bold text-slate-800">${this.escapeHtml(vendorName)}</td>
            <td class="p-2">${this.escapeHtml(generic)}</td>
            <td class="p-2">${this.escapeHtml(category)}</td>
            <td class="p-2 font-mono">${this.escapeHtml(batch)}</td>
            <td class="p-2 font-mono">${this.escapeHtml(expiry)}</td>
            <td class="p-2 text-right">₹${pprice.toFixed(2)}</td>
            <td class="p-2 text-center">${stock}</td>
            <td class="p-2 font-bold ${isValid ? 'text-emerald-700' : 'text-rose-700'}">${isValid ? 'VALID ✓' : 'ERR: ' + errors.join(', ')}</td>
          `;
          previewTbody.appendChild(tr);
        });

        summaryCounts.innerHTML = `Total Rows: <strong>${rows.length}</strong> | Valid: <strong class="text-emerald-600">${validCount}</strong> | Errors: <strong class="text-rose-600">${invalidCount}</strong>`;
        btnConfirm.disabled = validCount === 0;

        document.getElementById('import-preview-section').classList.remove('hidden');
      } catch (err) {
        UI.showToast('Failed to parse Excel file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async confirmImport() {
    if (this.importValidRows.length === 0) return;

    try {
      const res = await API.post('/medicines/import-confirm', { rows: this.importValidRows });
      if (res.success) {
        UI.showToast(res.message, 'success');
        UI.closeModal('modal-import-excel');
        this.loadMedicines();
        this.loadCategories();
        this.loadVendors();
      } else {
        UI.showToast(res.message || 'Failed to import Excel rows.', 'error');
      }
    } catch (error) {
      UI.showToast(error.message || 'Error executing import.', 'error');
    }
  },

  async clearAllInventoryData() {
    if (!confirm('⚠️ WARNING: Are you sure you want to CLEAR ALL inventory & vendor database tables?\n\nThis will wipe out:\n- All Medicine Stock Records\n- All Vendor Purchases & Items\n- All Purchase Return Logs\n- All Expired Disposals History\n- All Registered Vendors\n\nThis action cannot be undone!')) {
      return;
    }

    try {
      const res = await API.post('/medicines/clear-all-data');
      if (res && res.success) {
        UI.showToast(res.message, 'success');
        this.list = [];
        this.vendorsList = [];
        this.purchasesList = [];
        this.returnsList = [];
        this.expiredDetails = null;

        this.loadMedicines();
        this.loadVendors();
        this.loadPurchases();
        this.loadReturns();
        this.loadExpiredDetails();
      } else {
        UI.showToast(res?.message || 'Failed to clear data.', 'error');
      }
    } catch (error) {
      UI.showToast(error.message || 'Error clearing database data.', 'error');
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.initPageGuard();
  Medicines.init();
});
