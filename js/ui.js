/* ==========================================================================
   UI UTILITIES, TOASTS, MODALS, FORMATTERS & SIDEBAR HOVER TOGGLE
   ========================================================================== */

const UI = {
  initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtns = document.querySelectorAll('.btn-toggle-sidebar');
    if (!sidebar) return;

    // Create backdrop overlay for mobile view if not exists
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    const closeMobileSidebar = () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('active');
      document.body.style.overflow = '';
    };

    backdrop.addEventListener('click', closeMobileSidebar);

    // Close mobile menu when navigating
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeMobileSidebar();
        }
      });
    });

    // Restore saved state (desktop)
    const isCollapsed = localStorage.getItem('medicare_sidebar_collapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
      sidebar.classList.add('collapsed');
    }

    // Toggle Pin/Unpin or Mobile Open Handler
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
          const isOpen = sidebar.classList.toggle('mobile-open');
          backdrop.classList.toggle('active', isOpen);
          document.body.style.overflow = isOpen ? 'hidden' : '';
        } else {
          sidebar.classList.toggle('collapsed');
          const nowCollapsed = sidebar.classList.contains('collapsed');
          localStorage.setItem('medicare_sidebar_collapsed', nowCollapsed ? 'true' : 'false');
          if (nowCollapsed) {
            UI.showToast('Sidebar collapsed.', 'info');
          } else {
            UI.showToast('Sidebar pinned expanded.', 'info');
          }
        }
      });
    });

    // Cursor Movement / Hover Reveal Handler (Desktop only)
    sidebar.addEventListener('mouseenter', () => {
      if (window.innerWidth > 768 && sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('hover-expanded');
      }
    });

    sidebar.addEventListener('mouseleave', () => {
      if (window.innerWidth > 768 && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('hover-expanded');
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (window.innerWidth > 768 && sidebar.classList.contains('collapsed')) {
        if (e.clientX <= 70) {
          sidebar.classList.add('hover-expanded');
        } else if (e.clientX > 260 && !sidebar.matches(':hover')) {
          sidebar.classList.remove('hover-expanded');
        }
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeMobileSidebar();
      }
    });
  },

  showLoading() {
    let loader = document.getElementById('global-ui-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'global-ui-loader';
      loader.className = 'fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-[9999] flex items-center justify-center';
      loader.innerHTML = `
        <div class="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-slate-200 text-xs font-bold">
          <svg class="w-5 h-5 text-sky-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading...</span>
        </div>
      `;
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  },

  hideLoading() {
    const loader = document.getElementById('global-ui-loader');
    if (loader) {
      loader.style.display = 'none';
    }
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

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let svgIcon = `<svg class="w-5 h-5 text-sky-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    if (type === 'success') {
      svgIcon = `<svg class="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    } else if (type === 'error') {
      svgIcon = `<svg class="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    } else if (type === 'warning') {
      svgIcon = `<svg class="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    }

    toast.innerHTML = `${svgIcon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  formatCurrency(amount) {
    const val = parseFloat(amount || 0);
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const d = new Date(dateTimeStr);
    return d.toLocaleString('en-IN', { 
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  },

  renderInvoiceHtml(invoice) {
    const itemsHtml = invoice.items.map((it, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>
          <strong>${it.medicine_name}</strong>
          ${it.generic_name ? `<br><small style="color:#64748b;">${it.generic_name}</small>` : ''}
        </td>
        <td style="text-align: center;">${it.batch_number || '-'}</td>
        <td style="text-align: right;">${UI.formatCurrency(it.unit_price)}</td>
        <td style="text-align: center;">${it.quantity}</td>
        <td style="text-align: right;">${UI.formatCurrency(it.total_price)}</td>
      </tr>
    `).join('');

    return `
      <div class="invoice-preview-container printable-area" id="printable-invoice">
        <div class="invoice-header">
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 0.4rem;">
            <img src="/images/logo.png" alt="ORTHOFIX" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;">
            <h2 style="margin: 0; font-size: 1.35rem; color: #0f172a;">ORTHOFIX SPECIALITY CLINIC</h2>
          </div>
          <p style="font-weight: 700; color: #0f172a; margin-bottom: 0.15rem;">Speciality Orthopaedic Clinic & Pharmacy Department</p>
          <p style="font-weight: 600; color: #0284c7; margin: 0.2rem 0; font-size: 0.85rem;">Doctor Contact: mobile 7010764592, landline - 044-29996504</p>
          <p style="font-size: 0.8rem; color: #64748b; margin: 0.1rem 0;">mail - orthofixspecialityclinic@gmail.com</p>
          <h4 style="margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 1px; color: #0284c7;">RETAIL TAX INVOICE</h4>
        </div>

        <div class="invoice-meta-grid" style="display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
          <div>
            <p style="margin: 3px 0;"><strong>Bill No:</strong> <span style="font-family: monospace;">${invoice.invoice_number}</span></p>
            <p style="margin: 3px 0;"><strong>Date & Time:</strong> ${UI.formatDateTime(invoice.created_at)}</p>
            <p style="margin: 3px 0;"><strong>Doctor Name:</strong> <span style="color: #0f766e; font-weight: 700;">👨‍⚕️ ${invoice.doctor_name || 'Dr. Specialist'}</span></p>
            <p style="margin: 3px 0;"><strong>Biller / Staff:</strong> ${invoice.worker_name || 'Staff'}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 3px 0;"><strong>Patient Name:</strong> ${invoice.customer_name || 'Walk-in Customer'}</p>
            <p style="margin: 3px 0;"><strong>Patient Token:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${invoice.patient_token ? '#' + invoice.patient_token : (invoice.consultation_id ? '#' + invoice.consultation_id : 'N/A')}</span></p>
            <p style="margin: 3px 0;"><strong>Mobile:</strong> ${invoice.customer_phone || 'N/A'}</p>
            <p style="margin: 3px 0;"><strong>Payment Method:</strong> <span style="font-weight: 700;">${invoice.payment_method || 'Cash'}</span> | <strong>Checkout Status:</strong> <span style="color: #16a34a; font-weight: 700;">${invoice.checkout_status || 'Completed'}</span></p>
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">#</th>
              <th>Medicine Description</th>
              <th style="width: 90px; text-align: center;">Batch</th>
              <th style="width: 80px; text-align: right;">Price</th>
              <th style="width: 50px; text-align: center;">Qty</th>
              <th style="width: 90px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="invoice-totals">
          ${invoice.medicine_charges > 0 ? `
          <div>
            <span>Medicine Subtotal:</span>
            <span>${UI.formatCurrency(invoice.medicine_charges)}</span>
          </div>
          ` : `
          <div>
            <span>Subtotal:</span>
            <span>${UI.formatCurrency(invoice.subtotal)}</span>
          </div>
          `}
          ${invoice.consultation_charges > 0 ? `
          <div>
            <span>Consultation Fee:</span>
            <span>${UI.formatCurrency(invoice.consultation_charges)}</span>
          </div>
          ` : ''}
          ${invoice.discount_amount > 0 ? `
          <div style="color: #ef4444;">
            <span>Discount (${invoice.discount_type === 'percent' ? invoice.discount_value + '%' : 'Fixed'}):</span>
            <span>-${UI.formatCurrency(invoice.discount_amount)}</span>
          </div>
          ` : ''}
          <div class="grand-row">
            <span>Final Payable Amount:</span>
            <span>${UI.formatCurrency(invoice.grand_total)}</span>
          </div>
          ${invoice.payment_method === 'Cash' ? `
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem;">
            <span>Amount Received:</span>
            <span>${UI.formatCurrency(invoice.amount_received)}</span>
          </div>
          <div style="font-size: 0.8rem; color: #10b981; font-weight: 700;">
            <span>Change Returned:</span>
            <span>${UI.formatCurrency(invoice.change_amount)}</span>
          </div>
          ` : ''}
        </div>

        <div class="invoice-footer">
          <p><strong>Thank you for visiting ORTHOFIX SPECIALITY CLINIC!</strong></p>
          <p style="margin-top: 0.25rem;">Attending Doctor: <strong>${invoice.doctor_name || 'Dr. Specialist'}</strong> | Billed by: <strong>${invoice.worker_name || 'Staff'}</strong></p>
        </div>
      </div>
    `;
  },

  async waitForImages(container) {
    if (!container) return;
    const images = Array.from(container.querySelectorAll('img'));
    const promises = images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });
    await Promise.all(promises);
  },

  getInvoiceFileName(invoice) {
    if (!invoice) return 'Invoice.pdf';
    const invNo = invoice.invoice_number || 'Invoice';
    const rawCustomer = invoice.customer_name || 'Walk-in Customer';
    const sanitizedCustomer = rawCustomer.replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '_');
    return `${invNo}_${sanitizedCustomer || 'Customer'}.pdf`;
  },

  async downloadInvoicePdf(invoice) {
    if (!invoice || (!invoice.id && !invoice.invoice_number)) {
      UI.showToast('Invalid invoice data for PDF export.', 'error');
      return;
    }
    UI.showToast('Preparing PDF download...', 'info');

    // Create an isolated hidden iframe for clean rendering free of parent scroll offsets & modal overlays
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = '750px';
    iframe.style.height = '1050px';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <link rel="stylesheet" href="/css/styles.css">
          <style>
            * { box-sizing: border-box; }
            body {
              background-color: #ffffff !important;
              margin: 0 !important;
              padding: 20px !important;
              font-family: 'Plus Jakarta Sans', system-ui, sans-serif !important;
              color: #0f172a !important;
              width: 750px !important;
            }
          </style>
        </head>
        <body>
          ${UI.renderInvoiceHtml(invoice)}
        </body>
        </html>
      `);
      doc.close();

      await new Promise(resolve => setTimeout(resolve, 250));
      await UI.waitForImages(doc.body);

      const targetEl = doc.getElementById('printable-invoice') || doc.body;
      const fileName = UI.getInvoiceFileName(invoice);

      if (typeof html2pdf !== 'undefined') {
        const opt = {
          margin: [0.3, 0.3, 0.3, 0.3],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          },
          jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opt).from(targetEl).save();
        UI.showToast(`Invoice ${invoice.invoice_number} downloaded successfully`, 'success');
      } else if (typeof html2canvas !== 'undefined') {
        const canvas = await html2canvas(targetEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const jsPDFClass = window.jsPDF || (window.jspdf ? window.jspdf.jsPDF : null);
        if (jsPDFClass) {
          const pdf = new jsPDFClass('p', 'pt', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(fileName);
          UI.showToast(`Invoice ${invoice.invoice_number} downloaded successfully`, 'success');
        } else {
          UI.showToast('PDF generator library loading...', 'warning');
        }
      } else {
        UI.showToast('PDF generator library loading...', 'warning');
      }
    } catch (err) {
      console.error('PDF Generation Error:', err);
      UI.showToast('Failed to generate PDF document.', 'error');
    } finally {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }
  },

  async downloadInvoiceAsPDF(invoice) {
    return this.downloadInvoicePdf(invoice);
  },

  printInvoice(invoice) {
    if (!invoice) return;
    // Direct print without opening modal-invoice popup dialog
    const oldContainer = document.getElementById('direct-print-container');
    if (oldContainer) oldContainer.remove();

    const container = document.createElement('div');
    container.id = 'direct-print-container';
    container.className = 'printable-area';
    container.style.position = 'absolute';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '100%';
    container.style.backgroundColor = '#ffffff';
    container.innerHTML = UI.renderInvoiceHtml(invoice);
    document.body.appendChild(container);

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (container.parentNode) container.parentNode.removeChild(container);
      }, 1000);
    }, 150);
  },

  initFooterLiveClock() {
    const clockEl = document.getElementById('footer-live-clock');
    if (!clockEl) return;
    const updateTime = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };
    updateTime();
    setInterval(updateTime, 1000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UI.initSidebarToggle();
  UI.initFooterLiveClock();
});

window.UI = UI;
