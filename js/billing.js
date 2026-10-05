/* ==========================================================================
   POS BILLING SYSTEM MODULE — TEXT BOX & DROPDOWN QUANTITY SELECTOR
   ========================================================================== */

const Billing = {
  cart: [], // Array of { medicine, quantity, unit_price, total_price }
  medicines: [],
  discountType: 'fixed',
  discountValue: 0,
  paymentMethod: 'Cash',
  amountReceived: 0,
  searchDebounceTimer: null,
  activePrescriptionId: null,
  todaysPrescriptions: [],

  allMedicines: [],

  init() {
    this.bindEvents();
    this.loadMedicines();
    this.loadCategories();
    this.renderCart();
    this.loadTodaysPrescriptions();
  },

  bindEvents() {
    // Prescription Modal Events
    const btnLoadRx = document.getElementById('btn-load-prescription');
    const modalLoadRx = document.getElementById('modal-load-prescription');
    const btnFetchRx = document.getElementById('btn-fetch-rx');
    
    if (btnLoadRx && modalLoadRx) {
      btnLoadRx.addEventListener('click', () => {
        modalLoadRx.classList.remove('hidden');
        modalLoadRx.classList.add('active'); // If using ui.js logic
        document.getElementById('rx-identifier').focus();
      });
    }

    if (btnFetchRx) {
      btnFetchRx.addEventListener('click', () => this.fetchPrescription());
    }

    // Today's Prescription Fast Search Box
    const searchRxToday = document.getElementById('search-prescription-today');
    if (searchRxToday) {
      searchRxToday.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        if (val) {
          // It might be formatted as "Name - Token: #1" or similar
          // Let's just try to extract the token if possible or use the raw value
          let identifier = val;
          const match = val.match(/Token:\s*#(\d+)/i);
          if (match) {
            identifier = match[1];
          }
          
          this.fetchPrescriptionByIdentifier(identifier);
          searchRxToday.value = ''; // clear after load
        }
      });
    }

    // Medicine Search Input — Ultra Fast Local Filter + Debounced Server Query
    const searchInput = document.getElementById('search-medicine-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (this.allMedicines && this.allMedicines.length > 0) {
          // Instant Local Sub-Millisecond Filter
          this.medicines = this.allMedicines.filter(m => 
            m.name.toLowerCase().includes(val) ||
            m.generic_name.toLowerCase().includes(val) ||
            m.batch_number.toLowerCase().includes(val) ||
            (m.barcode && m.barcode.toLowerCase().includes(val))
          );
          this.renderMedicineGrid();
        }

        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.loadMedicines();
        }, 150);
      });
    }

    // Category Filter Select
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.loadMedicines());
    }

    // Status Filter Select
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => this.loadMedicines());
    }

    // Discount Type & Value Inputs (Modal & Cart Inline)
    const discountTypeSelect = document.getElementById('discount-type');
    const discountValInput = document.getElementById('discount-value');
    const cartDiscountType = document.getElementById('cart-discount-type');
    const cartDiscountVal = document.getElementById('cart-discount-value');

    const updateDiscount = (type, val) => {
      this.discountType = type;
      this.discountValue = parseFloat(val) || 0;
      if (discountTypeSelect && discountTypeSelect.value !== type) discountTypeSelect.value = type;
      if (cartDiscountType && cartDiscountType.value !== type) cartDiscountType.value = type;
      if (discountValInput && parseFloat(discountValInput.value) !== this.discountValue) discountValInput.value = this.discountValue || '';
      if (cartDiscountVal && parseFloat(cartDiscountVal.value) !== this.discountValue) cartDiscountVal.value = this.discountValue || '';
      this.calculateTotals();
    };

    if (discountTypeSelect) {
      discountTypeSelect.addEventListener('change', (e) => updateDiscount(e.target.value, discountValInput?.value));
    }
    if (discountValInput) {
      discountValInput.addEventListener('input', (e) => updateDiscount(discountTypeSelect?.value || 'fixed', e.target.value));
    }
    if (cartDiscountType) {
      cartDiscountType.addEventListener('change', (e) => updateDiscount(e.target.value, cartDiscountVal?.value));
    }
    if (cartDiscountVal) {
      cartDiscountVal.addEventListener('input', (e) => updateDiscount(cartDiscountType?.value || 'percent', e.target.value));
    }

    // Payment Method Buttons
    const payBtns = document.querySelectorAll('.pay-btn');
    payBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        payBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.paymentMethod = btn.dataset.method;
        
        const cashBox = document.getElementById('cash-payment-box');
        if (cashBox) {
          cashBox.style.display = this.paymentMethod === 'Cash' ? 'flex' : 'none';
        }
        this.calculateTotals();
      });
    });

    // Cash Amount Received Input
    const amountRecInput = document.getElementById('amount-received');
    if (amountRecInput) {
      amountRecInput.addEventListener('input', (e) => {
        this.amountReceived = parseFloat(e.target.value) || 0;
        this.calculateTotals();
      });
    }

    // Clear Cart Button
    const btnClearCart = document.getElementById('btn-clear-cart');
    if (btnClearCart) {
      btnClearCart.addEventListener('click', () => this.clearCart());
    }

    // Single Submit Bill Button
    const btnCompleteSale = document.getElementById('btn-complete-sale');
    if (btnCompleteSale) {
      btnCompleteSale.addEventListener('click', () => this.openSubmitPanel());
    }
  },

  async loadTodaysPrescriptions() {
    try {
      const res = await API.get('/prescriptions/today');
      if (res && res.success && res.prescriptions) {
        this.todaysPrescriptions = res.prescriptions;
        const datalist = document.getElementById('today-prescriptions-list');
        if (datalist) {
          datalist.innerHTML = '';
          this.todaysPrescriptions.forEach(rx => {
            const option = document.createElement('option');
            const name = rx.patient_name || 'Unknown Patient';
            const mobile = rx.patient_mobile ? ` - ${rx.patient_mobile}` : '';
            option.value = `${name} - Token: #${rx.patient_token}${mobile}`;
            datalist.appendChild(option);
          });
        }
      }
    } catch (err) {
      console.error('Failed to load today\'s prescriptions', err);
    }
  },

  async fetchPrescriptionByIdentifier(identifier) {
    if (!identifier) return;
    try {
      // Clean up identifier (e.g., if user typed "Token 3", extract "3")
      let cleanId = identifier.toString().trim();
      const numMatch = cleanId.match(/\d+/);
      if (numMatch && !cleanId.match(/[a-zA-Z]{5,}/)) { 
         // If it has numbers and is not a long name/mobile, just use the number
         cleanId = numMatch[0];
      }
      
      // Ensure allMedicines is fully populated for cart mapping
      if (!this.allMedicines || this.allMedicines.length === 0) {
        const medRes = await API.get('/medicines');
        if (medRes && medRes.success) {
          this.allMedicines = medRes.medicines;
        }
      }

      const res = await API.get(`/prescriptions/patient/${encodeURIComponent(cleanId)}`);

      if (res && res.success && res.prescription) {
        const rx = res.prescription;
        this.activePrescriptionId = rx.id;
        
        // Populate Customer Info
        const nameInput = document.getElementById('customer-name');
        const phoneInput = document.getElementById('customer-phone');
        if (nameInput) nameInput.value = rx.patient_name || '';
        if (phoneInput && rx.patient_mobile) phoneInput.value = rx.patient_mobile;

        UI.showToast(`Loaded Prescription for ${rx.patient_name || 'Patient Token #' + rx.patient_token}`, 'success');
        
        const modal = document.getElementById('modal-load-prescription');
        if (modal) modal.classList.remove('active');

        this.addPrescriptionItemsToCart(rx.items);
      } else {
        UI.showToast(res?.message || 'Prescription not found or already billed', 'error');
      }
    } catch (e) {
      console.error(e);
      UI.showToast('Failed to fetch prescription details.', 'error');
    }
  },

  async fetchPrescription() {
    const inputEl = document.getElementById('rx-identifier');
    const identifier = inputEl?.value.trim();
    if (!identifier) {
      UI.showToast('Please enter Token # or Mobile Number', 'warning');
      return;
    }
    
    const btn = document.getElementById('btn-fetch-rx');
    if (btn) {
      btn.textContent = 'Loading...';
      btn.disabled = true;
    }
    
    await this.fetchPrescriptionByIdentifier(identifier);
    
    if (btn) {
      btn.textContent = 'Fetch Prescription';
      btn.disabled = false;
    }
    if (inputEl) inputEl.value = '';
  },

  addPrescriptionItemsToCart(items) {
    this.clearCart();
    if (items && items.length > 0) {
      for (const item of items) {
        const med = this.allMedicines.find(m => Number(m.id) === Number(item.medicine_id));
        if (med) {
          if (med.current_stock > 0) {
            const qtyToAdd = Math.min(item.quantity, med.current_stock);
            this.addToCart(med.id, qtyToAdd);
            
            if (qtyToAdd < item.quantity) {
              UI.showToast(`Partial stock for ${med.name}. Added ${qtyToAdd} instead of ${item.quantity}.`, 'warning');
            }
          } else {
            UI.showToast(`${med.name} is out of stock and could not be added.`, 'error');
          }
        } else {
          UI.showToast(`Medicine ID ${item.medicine_id} not found in inventory.`, 'error');
        }
      }
    }
  },

  async loadMedicines() {
    try {
      const search = document.getElementById('search-medicine-input')?.value || '';
      const category = document.getElementById('filter-category')?.value || 'All';
      const status = document.getElementById('filter-status')?.value || '';

      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (category && category !== 'All') queryParams.append('category', category);
      if (status) queryParams.append('status', status);

      const res = await API.get(`/medicines?${queryParams.toString()}`);
      if (res.success) {
        this.medicines = res.medicines;
        if (!search && category === 'All' && !status) {
          this.allMedicines = res.medicines;
        }
        this.renderMedicineGrid();
      }
    } catch (error) {
      UI.showToast('Failed to load medicines list.', 'error');
    }
  },

  async loadCategories() {
    try {
      const res = await API.get('/medicines/categories');
      if (res.success) {
        const select = document.getElementById('filter-category');
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

  renderMedicineGrid() {
    const grid = document.getElementById('medicine-grid');
    if (!grid) return;

    if (this.medicines.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
          <h3>No medicines found</h3>
          <p style="font-size: 0.85rem;">Try adjusting your search criteria or category filter.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.medicines.map(m => {
      let badgeClass = 'badge-instock';
      if (m.stock_status === 'LOW STOCK') badgeClass = 'badge-lowstock';
      if (m.stock_status === 'OUT OF STOCK') badgeClass = 'badge-outstock';
      if (m.stock_status === 'EXPIRED') badgeClass = 'badge-expired';

      const isDisabled = m.current_stock === 0 || m.is_expired;

      return `
        <div class="med-card ${isDisabled ? 'disabled' : ''}" onclick="Billing.addToCart(${m.id})">
          <div>
            <div class="med-header">
              <span class="med-name">${m.name}</span>
              <span class="badge ${badgeClass}">${m.stock_status}</span>
            </div>
            <div class="med-generic">${m.generic_name}</div>
          </div>
          <div>
            <div class="med-meta">
              <span>Batch: <strong>${m.batch_number}</strong></span>
              <span>Exp: <strong>${m.expiry_date}</strong></span>
            </div>
            <div class="med-meta" style="margin-top: 0.5rem;">
              <span class="med-price">${UI.formatCurrency(m.selling_price)} <small style="font-size: 0.7rem; font-weight: normal; color: #64748b;">(₹${((m.selling_price || 0) / (m.units_per_strip || 10)).toFixed(2)}/${m.category ? m.category : 'unit'})</small></span>
              <span style="font-size: 0.8rem; color: #64748b;">Stock: <strong>${m.current_stock} ${m.category ? m.category : 'units'}</strong></span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // ADD MEDICINE TO CURRENT BILL CART
  addToCart(medicineId, qtyToAdd = 1) {
    const med = this.allMedicines.find(m => Number(m.id) === Number(medicineId)) || this.medicines.find(m => Number(m.id) === Number(medicineId));
    if (!med) return;

    if (med.is_expired) {
      UI.showToast(`"${med.name}" is expired (${med.expiry_date}) and cannot be billed.`, 'error');
      return;
    }

    if (med.current_stock === 0) {
      UI.showToast(`This medicine (${med.name}) is currently out of stock.`, 'error');
      return;
    }

    const unitsPerStrip = med.units_per_strip || 10;
    const perTabletPrice = med.selling_price / unitsPerStrip;

    const existingIndex = this.cart.findIndex(item => Number(item.medicine.id) === Number(medicineId));

    if (existingIndex > -1) {
      const currentQty = this.cart[existingIndex].quantity;
      if (currentQty + qtyToAdd > med.current_stock) {
        UI.showToast(`Only ${med.current_stock} units available for ${med.name}.`, 'warning');
        return;
      }
      this.cart[existingIndex].quantity += qtyToAdd;
      this.cart[existingIndex].total_price = this.cart[existingIndex].quantity * perTabletPrice;
    } else {
      this.cart.push({
        medicine: med,
        quantity: qtyToAdd,
        unit_price: perTabletPrice,
        total_price: perTabletPrice * qtyToAdd
      });
    }

    this.renderCart(medicineId);
  },

  // UPDATE QUANTITY FROM TEXT BOX OR DROPDOWN SELECT
  setQuantity(index, value) {
    const item = this.cart[index];
    if (!item) return;

    let parsedVal = parseInt(value, 10);
    if (isNaN(parsedVal) || parsedVal <= 0) {
      this.removeFromCart(index);
      return;
    }

    if (parsedVal > item.medicine.current_stock) {
      UI.showToast(`Only ${item.medicine.current_stock} units available for ${item.medicine.name}.`, 'warning');
      item.quantity = item.medicine.current_stock;
    } else {
      item.quantity = parsedVal;
    }

    item.total_price = item.quantity * item.unit_price;
    this.renderCart();
  },

  removeFromCart(index) {
    this.cart.splice(index, 1);
    this.renderCart();
  },

  clearCart() {
    this.cart = [];
    this.discountValue = 0;
    const discInput = document.getElementById('discount-value');
    if (discInput) discInput.value = '';
    const cartDiscInput = document.getElementById('cart-discount-value');
    if (cartDiscInput) cartDiscInput.value = '';
    this.renderCart();
  },

  // GENERATE QUANTITY DROPDOWN SELECT OPTIONS
  generateQtySelectOptions(currentQty, maxStock) {
    const defaultOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100];
    const availableOptions = defaultOptions.filter(opt => opt <= maxStock);
    
    if (!availableOptions.includes(currentQty) && currentQty <= maxStock) {
      availableOptions.push(currentQty);
      availableOptions.sort((a, b) => a - b);
    }

    return availableOptions.map(opt => `
      <option value="${opt}" ${opt === currentQty ? 'selected' : ''}>Qty: ${opt}</option>
    `).join('');
  },

  // RENDER CURRENT BILL TABLE WITH MEDICINE NAME, TEXT BOX & DROPDOWN SELECT OPTION
  renderCart(highlightMedId = null) {
    const cartBody = document.getElementById('cart-table-body');
    const cartCountBadge = document.getElementById('cart-count-badge');
    if (cartCountBadge) cartCountBadge.textContent = `${this.cart.length} items`;

    if (!cartBody) return;

    if (this.cart.length === 0) {
      cartBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛒</div>
            <h4 style="font-size: 1rem; font-weight: 700; color: #64748b;">Current Bill is Empty</h4>
            <p style="font-size: 0.8rem; margin-top: 0.25rem;">Click any medicine on the left panel to add it to the bill.</p>
          </td>
        </tr>
      `;
      this.calculateTotals();
      return;
    }

    cartBody.innerHTML = this.cart.map((item, idx) => {
      const isHighlighted = highlightMedId && item.medicine.id === highlightMedId;
      const highlightStyle = isHighlighted ? 'background-color: #e0f2fe; transition: background-color 1s ease;' : '';

      return `
        <tr style="${highlightStyle}" id="cart-item-row-${item.medicine.id}" class="hover:bg-slate-50/80 transition-colors">
          <td class="p-2 align-middle">
            <strong class="cart-item-name font-bold text-xs text-sky-700 block leading-tight">
              ${item.medicine.name}
            </strong>
            <small class="text-slate-500 italic text-[11px] block leading-tight">${item.medicine.generic_name}</small>
            <div class="text-[10px] text-slate-500 mt-0.5 flex gap-2">
              <span>Batch: <strong class="text-slate-700">${item.medicine.batch_number}</strong></span>
              <span>Stock: <strong class="text-emerald-600">${item.medicine.current_stock}</strong></span>
            </div>
          </td>

          <td class="p-2 text-right align-middle font-bold text-xs text-slate-800">
            ₹${Number(item.unit_price).toFixed(2)}/${item.medicine.category ? item.medicine.category : 'unit'}
            <small class="text-slate-500 font-normal text-[10px] block">Strip: ₹${item.medicine.selling_price}</small>
          </td>

          <!-- TEXT BOX + DROPDOWN SELECTION OPTION FOR NUMBER OF MEDICINES -->
          <td class="p-2 text-center align-middle">
            <div class="flex items-center justify-center gap-1">
              <input type="number" 
                     class="qty-text-box w-11 p-1 border border-sky-500 rounded-md font-extrabold text-xs text-center outline-none bg-white focus:ring-2 focus:ring-sky-500/20" 
                     min="1" 
                     max="${item.medicine.current_stock}" 
                     value="${item.quantity}" 
                     onchange="Billing.setQuantity(${idx}, this.value)" 
                     title="Type custom quantity">
              
              <select class="qty-select-dropdown p-1 border border-slate-300 rounded-md text-[11px] font-bold bg-slate-50 cursor-pointer text-slate-800 outline-none" 
                      onchange="Billing.setQuantity(${idx}, this.value)" 
                      title="Select quantity from dropdown">
                ${this.generateQtySelectOptions(item.quantity, item.medicine.current_stock)}
              </select>
            </div>
          </td>

          <td class="p-2 text-right align-middle font-extrabold text-xs text-slate-900">
            ${UI.formatCurrency(item.total_price)}
          </td>

          <td class="p-2 text-center align-middle">
            <button class="btn-remove-item text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer" type="button" onclick="Billing.removeFromCart(${idx})" title="Remove ${item.medicine.name} from Bill">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.calculateTotals();
  },

  calculateTotals() {
    let subtotal = 0;
    let totalUnits = 0;
    this.cart.forEach(item => {
      subtotal += item.total_price;
      totalUnits += item.quantity;
    });

    let discountAmt = 0;
    if (this.discountType === 'percent') {
      discountAmt = (subtotal * (this.discountValue || 0)) / 100;
    } else {
      discountAmt = this.discountValue || 0;
    }

    const grandTotal = Math.max(0, subtotal - discountAmt);
    this.amountReceived = grandTotal;

    // Render summary UI
    const subtotalEl = document.getElementById('summary-subtotal');
    const grandTotalEl = document.getElementById('summary-grand-total');
    const panelTotalEl = document.getElementById('panel-total-amount');
    const panelFinalEl = document.getElementById('panel-final-total');
    const completeBtn = document.getElementById('btn-complete-sale');
    const footQtyEl = document.getElementById('foot-total-qty');
    const footAmountEl = document.getElementById('foot-total-amount');

    if (subtotalEl) subtotalEl.textContent = UI.formatCurrency(subtotal);
    if (grandTotalEl) grandTotalEl.textContent = UI.formatCurrency(grandTotal);
    if (panelTotalEl) panelTotalEl.textContent = UI.formatCurrency(subtotal);
    if (panelFinalEl) panelFinalEl.textContent = UI.formatCurrency(grandTotal);
    if (footQtyEl) footQtyEl.textContent = `${totalUnits} Unit${totalUnits === 1 ? '' : 's'}`;
    if (footAmountEl) footAmountEl.textContent = UI.formatCurrency(subtotal);

    // Ensure Submit button is always active and enabled
    if (completeBtn) {
      completeBtn.disabled = false;
      completeBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      completeBtn.removeAttribute('disabled');
    }
  },

  openSubmitPanel() {
    if (this.cart.length === 0) {
      UI.showToast('Cannot submit bill: Current Bill Cart is empty.', 'error');
      return;
    }

    const customerName = document.getElementById('customer-name')?.value.trim() || 'Walk-in Customer';
    let subtotal = 0;
    this.cart.forEach(item => { subtotal += item.total_price; });

    let discountAmt = 0;
    if (this.discountType === 'percent') {
      discountAmt = (subtotal * (this.discountValue || 0)) / 100;
    } else {
      discountAmt = this.discountValue || 0;
    }

    const grandTotal = Math.max(0, subtotal - discountAmt);

    const nameEl = document.getElementById('panel-bill-name');
    const totalEl = document.getElementById('panel-total-amount');
    const finalEl = document.getElementById('panel-final-total');

    if (nameEl) nameEl.textContent = customerName;
    if (totalEl) totalEl.textContent = UI.formatCurrency(subtotal);
    if (finalEl) finalEl.textContent = UI.formatCurrency(grandTotal);

    UI.openModal('modal-submit-summary');
  },

  lastSavedInvoice: null,

  async confirmAndSaveBill() {
    if (this.cart.length === 0) return;

    const customerName = document.getElementById('customer-name')?.value || '';
    const customerPhone = document.getElementById('customer-phone')?.value || '';

    let subtotal = 0;
    this.cart.forEach(item => { subtotal += item.total_price; });

    let discountAmt = 0;
    if (this.discountType === 'percent') {
      discountAmt = (subtotal * (this.discountValue || 0)) / 100;
    } else {
      discountAmt = this.discountValue || 0;
    }

    const grandTotal = Math.max(0, subtotal - discountAmt);

    const payload = {
      items: this.cart.map(item => ({
        medicine_id: item.medicine.id,
        quantity: item.quantity
      })),
      customer_name: customerName,
      customer_phone: customerPhone,
      discount_type: this.discountType || 'fixed',
      discount_value: this.discountValue || 0,
      payment_method: this.paymentMethod || 'Cash',
      amount_received: this.amountReceived || grandTotal,
      prescription_id: this.activePrescriptionId // Include active prescription
    };

    try {
      const btn = document.getElementById('btn-confirm-save-bill');
      if (btn) btn.disabled = true;

      const res = await API.post('/billing/sale', payload);
      if (res.success && res.invoice) {
        this.lastSavedInvoice = res.invoice;
        window.currentActiveInvoice = res.invoice;

        UI.closeModal('modal-submit-summary');

        // Populate Success & Print Modal
        const invNumEl = document.getElementById('success-inv-number');
        const custNameEl = document.getElementById('success-customer-name');
        const grandTotalEl = document.getElementById('success-total-amount');

        if (invNumEl) invNumEl.textContent = res.invoice.invoice_number;
        if (custNameEl) custNameEl.textContent = res.invoice.customer_name || 'Walk-in Customer';
        if (grandTotalEl) grandTotalEl.textContent = UI.formatCurrency(res.invoice.grand_total);

        UI.openModal('modal-bill-success');
        UI.showToast(`✅ Bill ${res.invoice.invoice_number} submitted successfully!`, 'success');
        
        // Reset Cart & Return to Clean Billing Screen
        this.clearCart();
        this.loadMedicines(); // Refresh live database stock
        
        const searchInput = document.getElementById('search-medicine-input');
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }

        // Reset prescription ID
        this.activePrescriptionId = null;
      }
    } catch (error) {
      UI.showToast(error.message || 'Failed to save bill.', 'error');
    } finally {
      const btn = document.getElementById('btn-confirm-save-bill');
      if (btn) btn.disabled = false;
    }
  },

  printSavedInvoice() {
    if (!this.lastSavedInvoice) {
      UI.showToast('No recent invoice found to print.', 'warning');
      return;
    }
    UI.closeModal('modal-bill-success');
    UI.printInvoice(this.lastSavedInvoice);
  },

  async downloadSavedInvoicePDF() {
    const inv = this.lastSavedInvoice || window.currentActiveInvoice;
    if (!inv) {
      UI.showToast('No recent invoice found.', 'warning');
      return;
    }
    await UI.downloadInvoiceAsPDF(inv);
  },

  async downloadCurrentModalInvoicePDF() {
    const inv = window.currentActiveInvoice || this.lastSavedInvoice;
    if (!inv) {
      UI.showToast('No active invoice found to download.', 'warning');
      return;
    }
    await UI.downloadInvoiceAsPDF(inv);
  },

  closeSuccessModal() {
    UI.closeModal('modal-bill-success');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('medicine-grid')) {
    Billing.init();
  }
});

window.Billing = Billing;
