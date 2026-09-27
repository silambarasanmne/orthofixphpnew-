/**
 * Patient Records Page Controller - Search, Date Filter, Sorting, Pagination, MediCard Download
 */

document.addEventListener('DOMContentLoaded', () => {
    Auth.initPageGuard();

    // Primary Search Elements
    const primarySearchInput = document.getElementById('primarySearchInput');
    const btnPrimarySearch = document.getElementById('btnPrimarySearch');

    // Consultation Form Elements
    const consultationFormContainer = document.getElementById('consultationFormContainer');
    const consultationLoadingOverlay = document.getElementById('consultationLoadingOverlay');

    const consultPatientName = document.getElementById('consultPatientName');
    const consultPatientAge = document.getElementById('consultPatientAge');
    const consultPatientMobile = document.getElementById('consultPatientMobile');
    const consultPatientToken = document.getElementById('consultPatientToken');
    const consultPatientDate = document.getElementById('consultPatientDate');
    const consultPatientIssues = document.getElementById('consultPatientIssues');
    const consultDoctorComment = document.getElementById('consultDoctorComment');

    const prescriptionTableBody = document.getElementById('prescriptionTableBody');
    const btnAddPrescriptionRow = document.getElementById('btnAddPrescriptionRow');
    const btnSubmitConsultation = document.getElementById('btnSubmitConsultation');

    const consultationSection = document.getElementById('consultationSection');
    const queueTableSection = document.getElementById('queueTableSection');
    const navBtnConsultation = document.getElementById('nav-btn-consultation');
    const navBtnQueue = document.getElementById('nav-btn-queue');

    const patientListContainer = document.getElementById('patientListContainer') || document.getElementById('queueTableSection');

    // Patient List Elements
    const patientsTableBody = document.getElementById('patientsTableBody');
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const clearDateBtn = document.getElementById('clearDateBtn');
    const sortSelect = document.getElementById('sortSelect');
    const limitSelect = document.getElementById('limitSelect');
    const paginationControls = document.getElementById('paginationControls');
    const recordCountInfo = document.getElementById('recordCountInfo');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');

    const btnExportCsv = document.getElementById('btn-export-csv');

    let state = {
        search: '',
        fromDate: '',
        toDate: '',
        page: 1,
        limit: 10,
        sortBy: 'created_at',
        order: 'DESC'
    };

    let searchTimeout = null;
    let activeConsultPatient = null;
    let inventoryMedicines = [];
    let rowIdCounter = 0;

    // --- API Helper ---
    async function apiRequest(endpoint, options = {}) {
        return API.request(endpoint, options);
    }

    // --- Load Inventory for Autocomplete ---
    async function loadInventory() {
        try {
            const res = await apiRequest('/medicines?limit=500');
            if (res && res.success && Array.isArray(res.medicines)) {
                inventoryMedicines = res.medicines;

                let datalist = document.getElementById('med-datalist');
                if (!datalist) {
                    datalist = document.createElement('datalist');
                    datalist.id = 'med-datalist';
                    document.body.appendChild(datalist);
                }
                datalist.innerHTML = inventoryMedicines.map(m => {
                    const genericStr = (m.generic_name && m.generic_name.toLowerCase() !== m.name.toLowerCase()) ? ` (${escapeHtml(m.generic_name)})` : '';
                    return `<option value="${escapeHtml(m.name)}${genericStr} - #${m.id}">Stock: ${m.current_stock || 0}</option>`;
                }).join('');
            }
        } catch (e) {
            console.warn("Failed to load medicines inventory", e);
        }
    }
    loadInventory();

    // --- Primary Search Logic ---
    async function performPrimarySearch() {
        const rawVal = primarySearchInput ? primarySearchInput.value.trim() : '';
        if (!rawVal) {
            Toast.error("Please enter a Token #, Mobile Number, or Patient Name");
            return;
        }

        // Clean input: remove leading # or "token" text if present
        const cleanVal = rawVal.replace(/^#/, '').replace(/^token\s*#?/i, '').trim();

        if (consultationLoadingOverlay) consultationLoadingOverlay.classList.remove('hidden');

        try {
            let patientData = null;

            // 1. If it's a numeric token (e.g. "1", "12"), try token lookup first
            if (/^\d+$/.test(cleanVal)) {
                try {
                    const tokenRes = await PatientAPI.getPatientByToken(cleanVal);
                    if (tokenRes && tokenRes.success && tokenRes.data) {
                        patientData = tokenRes.data;
                    }
                } catch (e) {
                    // Token API returned 404 or error, fall through to general search
                }
            }

            // 2. If token lookup didn't find patient or search term is mobile/name/alphanumeric, perform general patient search
            if (!patientData) {
                try {
                    const searchRes = await PatientAPI.getPatients({ search: cleanVal, limit: 1 });
                    if (searchRes && searchRes.success && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                        patientData = searchRes.data[0];
                    }
                } catch (e) {
                    // General search failed
                }
            }

            if (patientData) {
                activeConsultPatient = patientData;
                if (consultPatientName) consultPatientName.value = patientData.patient_name || '';
                if (consultPatientAge) consultPatientAge.value = patientData.age ? `${patientData.age} Years` : '';
                if (consultPatientMobile) consultPatientMobile.value = patientData.mobile || '';
                if (consultPatientToken) consultPatientToken.value = `#${patientData.token}`;
                if (consultPatientDate) {
                    const regDate = patientData.created_at ? new Date(patientData.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                    }) : '';
                    consultPatientDate.value = regDate;
                }
                if (consultPatientIssues) consultPatientIssues.value = patientData.symptoms || 'No issues reported.';
                if (consultDoctorComment) consultDoctorComment.value = patientData.doctor_comment || '';

                // Clear existing prescription rows
                if (prescriptionTableBody) {
                    prescriptionTableBody.innerHTML = '';
                }

                // Check if there is an existing pending prescription for this patient token
                try {
                    const prescRes = await apiRequest(`/prescriptions/patient/${patientData.token}`);
                    if (prescRes && prescRes.success && prescRes.prescription) {
                        if (consultDoctorComment && prescRes.prescription.doctor_comment) {
                            consultDoctorComment.value = prescRes.prescription.doctor_comment;
                        }
                        if (prescRes.prescription.items && prescRes.prescription.items.length > 0) {
                            prescRes.prescription.items.forEach(item => {
                                addPrescriptionRow(item.medicine_id, item.quantity, item.instructions, item.medicine_name);
                            });
                        } else {
                            addPrescriptionRow();
                        }
                    } else {
                        addPrescriptionRow();
                    }
                } catch (e) {
                    addPrescriptionRow();
                }

                Toast.success(`Patient #${patientData.token} (${patientData.patient_name}) loaded`);

                if (consultationFormContainer) {
                    consultationFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                Toast.error(`No patient found for "${rawVal}"`);
            }
        } catch (e) {
            console.error('Error during primary search:', e);
            Toast.error('An error occurred during search');
        } finally {
            if (consultationLoadingOverlay) consultationLoadingOverlay.classList.add('hidden');
        }
    }

    if (btnPrimarySearch) btnPrimarySearch.addEventListener('click', performPrimarySearch);
    if (primarySearchInput) {
        primarySearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performPrimarySearch();
        });
    }


    // --- Prescription Table Logic ---
    if (btnAddPrescriptionRow) {
        btnAddPrescriptionRow.addEventListener('click', () => {
            addPrescriptionRow();
        });
    }

    function addPrescriptionRow(medId = '', qty = 0, instruction = '', medName = '', days = 3) {
        if (!prescriptionTableBody) return;
        rowIdCounter++;
        const rowId = rowIdCounter;
        const tr = document.createElement('tr');
        tr.id = `presc-row-${rowId}`;
        tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors';

        let initialMedValue = '';
        if (medId) {
            const m = inventoryMedicines.find(x => Number(x.id) === Number(medId));
            if (m) {
                const genericStr = (m.generic_name && m.generic_name.toLowerCase() !== m.name.toLowerCase()) ? ` (${m.generic_name})` : '';
                initialMedValue = `${m.name}${genericStr} - #${m.id}`;
            } else if (medName) {
                initialMedValue = `${medName} - #${medId}`;
            } else {
                initialMedValue = `#${medId}`;
            }
        } else if (medName) {
            initialMedValue = medName;
        }

        // Parse defaults from instruction if provided
        let parsedDays = days || 3;
        let parsedFreq = '1-0-1';
        let parsedFood = 'After Food';

        if (instruction) {
            const dMatch = instruction.match(/(\d+)\s*Days?/i);
            if (dMatch) parsedDays = parseInt(dMatch[1], 10);

            if (instruction.includes('Apply 3 Times/Day')) parsedFreq = 'Apply 3 Times/Day';
            else if (instruction.includes('Apply 2 Times/Day')) parsedFreq = 'Apply 2 Times/Day';
            else if (instruction.includes('Apply Once Daily')) parsedFreq = 'Apply Once Daily';
            else if (instruction.includes('Apply on Affected Area') || instruction.includes('Apply Gently')) parsedFreq = 'Apply on Affected Area';
            else if (instruction.includes('1-1-1-1')) parsedFreq = '1-1-1-1';
            else if (instruction.includes('1-1-1') || instruction.toLowerCase().includes('3 times')) parsedFreq = '1-1-1';
            else if (instruction.includes('1-0-1') || instruction.toLowerCase().includes('mrng & evng')) parsedFreq = '1-0-1';
            else if (instruction.includes('1-0-0')) parsedFreq = '1-0-0';
            else if (instruction.includes('0-1-0')) parsedFreq = '0-1-0';
            else if (instruction.includes('0-0-1')) parsedFreq = '0-0-1';
            else if (instruction.includes('SOS')) parsedFreq = 'SOS';

            if (instruction.includes('External Application')) parsedFood = 'External Application';
            else if (instruction.includes('Apply on Affected Area')) parsedFood = 'Apply on Affected Area';
            else if (instruction.includes('Local Application Only')) parsedFood = 'Local Application Only';
            else if (instruction.includes('Before Food')) parsedFood = 'Before Food';
            else if (instruction.includes('With Food')) parsedFood = 'With Food';
            else if (instruction.includes('After Food')) parsedFood = 'After Food';
        }

        tr.innerHTML = `
      <td class="p-2 align-top">
        <input type="text" list="med-datalist" value="${escapeHtml(initialMedValue)}" placeholder="Type medicine name..." class="med-search-input form-input w-full px-2 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-100 focus:ring-1 focus:ring-teal-500">
      </td>
      <td class="p-2 align-top">
        <div class="flex flex-col gap-1">
          <select class="freq-select form-input w-full px-1.5 py-1 rounded text-[11px] bg-slate-900 border border-slate-700 text-teal-300 font-medium focus:ring-1 focus:ring-teal-500">
            <optgroup label="Oral / Tablets">
              <option value="1-0-1" data-count="2" ${parsedFreq === '1-0-1' ? 'selected' : ''}>1-0-1 (Morning & Evening - 2x/day)</option>
              <option value="1-1-1" data-count="3" ${parsedFreq === '1-1-1' ? 'selected' : ''}>1-1-1 (3 Times in Day - Mrng, Aftn, Evng)</option>
              <option value="1-0-0" data-count="1" ${parsedFreq === '1-0-0' ? 'selected' : ''}>1-0-0 (Morning Only - 1x/day)</option>
              <option value="0-1-0" data-count="1" ${parsedFreq === '0-1-0' ? 'selected' : ''}>0-1-0 (Afternoon Only - 1x/day)</option>
              <option value="0-0-1" data-count="1" ${parsedFreq === '0-0-1' ? 'selected' : ''}>0-0-1 (Night Only - 1x/day)</option>
              <option value="1-0-1-1" data-count="3" ${parsedFreq === '1-0-1-1' ? 'selected' : ''}>1-0-1-1 (Mrng, Evng & Night - 3x/day)</option>
              <option value="1-1-1-1" data-count="4" ${parsedFreq === '1-1-1-1' ? 'selected' : ''}>1-1-1-1 (4 Times a Day)</option>
            </optgroup>
            <optgroup label="Ointment / Cream / Topical">
              <option value="Apply 2 Times/Day" data-count="1" ${parsedFreq === 'Apply 2 Times/Day' ? 'selected' : ''}>Apply 2 Times/Day (Mrng & Night)</option>
              <option value="Apply 3 Times/Day" data-count="1" ${parsedFreq === 'Apply 3 Times/Day' ? 'selected' : ''}>Apply 3 Times/Day (Mrng, Aftn, Evng)</option>
              <option value="Apply Once Daily" data-count="1" ${parsedFreq === 'Apply Once Daily' ? 'selected' : ''}>Apply Once Daily (Night/Bedtime)</option>
              <option value="Apply on Affected Area" data-count="1" ${parsedFreq === 'Apply on Affected Area' ? 'selected' : ''}>Apply Gently on Affected Area</option>
            </optgroup>
            <optgroup label="General / SOS">
              <option value="SOS" data-count="1" ${parsedFreq === 'SOS' ? 'selected' : ''}>SOS (As Needed)</option>
            </optgroup>
          </select>
          <div class="flex items-center gap-1">
            <button type="button" data-pill="M" class="timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border transition-colors" title="Morning">M</button>
            <button type="button" data-pill="A" class="timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border transition-colors" title="Afternoon">A</button>
            <button type="button" data-pill="E" class="timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border transition-colors" title="Evening">E</button>
            <button type="button" data-pill="N" class="timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border transition-colors" title="Night">N</button>
          </div>
        </div>
      </td>
      <td class="p-2 align-top text-center">
        <input type="number" min="1" max="180" value="${parsedDays}" class="days-input form-input w-12 px-1 py-1 rounded text-xs text-center font-bold bg-slate-900 border border-slate-700 text-amber-300 focus:ring-1 focus:ring-teal-500 mx-auto">
      </td>
      <td class="p-2 align-top">
        <select class="food-select form-input w-full px-1.5 py-1 rounded text-[11px] bg-slate-900 border border-slate-700 text-slate-200 focus:ring-1 focus:ring-teal-500">
          <option value="After Food" ${parsedFood === 'After Food' ? 'selected' : ''}>After Food</option>
          <option value="Before Food" ${parsedFood === 'Before Food' ? 'selected' : ''}>Before Food</option>
          <option value="With Food" ${parsedFood === 'With Food' ? 'selected' : ''}>With Food</option>
          <option value="External Application" ${parsedFood === 'External Application' ? 'selected' : ''}>External Application (Ointment/Cream)</option>
          <option value="Apply on Affected Area" ${parsedFood === 'Apply on Affected Area' ? 'selected' : ''}>Apply on Affected Area</option>
          <option value="Local Application Only" ${parsedFood === 'Local Application Only' ? 'selected' : ''}>Local Application Only</option>
        </select>
      </td>
      <td class="p-2 align-top text-center">
        <input type="number" min="1" value="${qty || 1}" class="qty-input form-input w-14 px-1 py-1 rounded text-xs text-center font-bold bg-slate-900 border border-slate-700 text-emerald-300 focus:ring-1 focus:ring-teal-500 mx-auto">
      </td>
      <td class="p-2 align-top text-center">
        <button type="button" class="btn-remove-row text-red-400 hover:text-red-300 p-1 hover:bg-slate-800 rounded transition-colors" title="Remove Row">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
      </td>
    `;

        tr.querySelector('.btn-remove-row').addEventListener('click', () => {
            tr.remove();
            if (prescriptionTableBody.children.length === 0) {
                addPrescriptionRow();
            }
        });

        const freqSelect = tr.querySelector('.freq-select');
        const foodSelect = tr.querySelector('.food-select');
        const daysInput = tr.querySelector('.days-input');
        const qtyInput = tr.querySelector('.qty-input');
        const pillBtns = tr.querySelectorAll('.timing-pill');
        const medInput = tr.querySelector('.med-search-input');
        let isManualQtyOverride = false;

        const isOintmentOrTopical = () => {
            const fVal = freqSelect ? freqSelect.value : '';
            const foodVal = foodSelect ? foodSelect.value : '';
            return fVal.startsWith('Apply') || foodVal.includes('External') || foodVal.includes('Affected Area') || foodVal.includes('Local Application');
        };

        const syncPillsFromFreq = (freqCode) => {
            const map = {
                '1-0-1': ['M', 'E'],
                '1-1-1': ['M', 'A', 'E'],
                '1-0-0': ['M'],
                '0-1-0': ['A'],
                '0-0-1': ['N'],
                '1-0-1-1': ['M', 'E', 'N'],
                '1-1-1-1': ['M', 'A', 'E', 'N'],
                'Apply 2 Times/Day': ['M', 'E'],
                'Apply 3 Times/Day': ['M', 'A', 'E'],
                'Apply Once Daily': ['N'],
                'Apply on Affected Area': ['M', 'E'],
                'SOS': ['M']
            };
            const activePills = map[freqCode] || ['M', 'E'];
            pillBtns.forEach(btn => {
                const code = btn.getAttribute('data-pill');
                if (activePills.includes(code)) {
                    btn.className = 'timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border border-teal-500 bg-teal-500/20 text-teal-300 shadow-sm';
                } else {
                    btn.className = 'timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors';
                }
            });
        };

        const recalculateQty = () => {
            if (isOintmentOrTopical()) {
                if (!isManualQtyOverride) {
                    qtyInput.value = 1; // Default 1 Tube/Unit for Ointments & Creams
                }
                return;
            }

            let timesPerDay = 2;
            const activePillElements = Array.from(pillBtns).filter(btn => btn.classList.contains('bg-teal-500/20'));
            if (activePillElements.length > 0) {
                timesPerDay = activePillElements.length;
            } else if (freqSelect) {
                const opt = freqSelect.options[freqSelect.selectedIndex];
                timesPerDay = opt ? parseInt(opt.getAttribute('data-count') || '2', 10) : 2;
            }

            const d = parseInt(daysInput.value, 10) || 1;
            const computedQty = timesPerDay * d;
            if (!isManualQtyOverride) {
                qtyInput.value = computedQty;
            }
        };

        const detectMedicineType = () => {
            const val = medInput.value.trim().toLowerCase();
            if (!val) return;

            const isTopical = /ointment|cream|gel|lotion|topical|balm|liniment|rub|tube/i.test(val);
            if (isTopical) {
                if (foodSelect) foodSelect.value = 'External Application';
                if (freqSelect) freqSelect.value = 'Apply 2 Times/Day';
                syncPillsFromFreq('Apply 2 Times/Day');
                isManualQtyOverride = false;
                recalculateQty();
            }
        };

        syncPillsFromFreq(parsedFreq);
        if (!qty) {
            recalculateQty();
        }

        freqSelect.addEventListener('change', () => {
            syncPillsFromFreq(freqSelect.value);
            isManualQtyOverride = false;
            recalculateQty();
        });

        foodSelect.addEventListener('change', () => {
            isManualQtyOverride = false;
            recalculateQty();
        });

        pillBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const isCurrentlyActive = btn.classList.contains('bg-teal-500/20');
                if (isCurrentlyActive) {
                    btn.className = 'timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors';
                } else {
                    btn.className = 'timing-pill flex-1 py-0.5 text-[10px] font-bold rounded border border-teal-500 bg-teal-500/20 text-teal-300 shadow-sm';
                }

                const activeCodes = Array.from(pillBtns).filter(b => b.classList.contains('bg-teal-500/20')).map(b => b.getAttribute('data-pill'));
                let matchedFreq = '1-0-1';
                if (activeCodes.length === 3 && activeCodes.includes('M') && activeCodes.includes('A') && activeCodes.includes('E')) matchedFreq = '1-1-1';
                else if (activeCodes.length === 2 && activeCodes.includes('M') && activeCodes.includes('E')) matchedFreq = '1-0-1';
                else if (activeCodes.length === 1 && activeCodes.includes('M')) matchedFreq = '1-0-0';
                else if (activeCodes.length === 1 && activeCodes.includes('A')) matchedFreq = '0-1-0';
                else if (activeCodes.length === 1 && activeCodes.includes('N')) matchedFreq = '0-0-1';
                else if (activeCodes.length === 4) matchedFreq = '1-1-1-1';

                freqSelect.value = matchedFreq;
                isManualQtyOverride = false;
                recalculateQty();
            });
        });

        daysInput.addEventListener('input', () => {
            isManualQtyOverride = false;
            recalculateQty();
        });

        qtyInput.addEventListener('input', () => {
            isManualQtyOverride = true;
        });

        // Auto add next row when medicine is selected/entered in the last row
        const autoAddNextRow = () => {
            const isLast = (tr === prescriptionTableBody.lastElementChild);
            if (isLast && medInput.value.trim() !== '') {
                addPrescriptionRow();
            }
        };

        medInput.addEventListener('change', () => {
            detectMedicineType();
            autoAddNextRow();
        });

        medInput.addEventListener('blur', autoAddNextRow);
        medInput.addEventListener('input', () => {
            detectMedicineType();
            if (medInput.value.includes('- #')) {
                autoAddNextRow();
            }
        });

        // Auto add row on Enter press inside this row
        tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addPrescriptionRow();

                setTimeout(() => {
                    const lastRow = prescriptionTableBody.lastElementChild;
                    if (lastRow) {
                        const input = lastRow.querySelector('.med-search-input');
                        if (input) input.focus();
                    }
                }, 10);
            }
        });

        prescriptionTableBody.appendChild(tr);
    }


    if (consultDoctorComment) {
        consultDoctorComment.addEventListener('input', () => {
            const val = consultDoctorComment.value.trim();
            const doctorNoteAlert = document.getElementById('doctorNoteAlert');
            if (val.length > 0) {
                consultDoctorComment.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/50', 'bg-rose-950/30');
                if (doctorNoteAlert) doctorNoteAlert.classList.add('hidden');
            }
        });
    }

    // --- Submit Consultation & Prescription ---
    if (btnSubmitConsultation) {
        btnSubmitConsultation.addEventListener('click', async () => {
            if (!activeConsultPatient) {
                Toast.warning('Please select or search for a patient first');
                return;
            }

            const comment = consultDoctorComment ? consultDoctorComment.value.trim() : '';
            const doctorNoteAlert = document.getElementById('doctorNoteAlert');

            if (!comment) {
                if (consultDoctorComment) {
                    consultDoctorComment.classList.add('border-rose-500', 'ring-2', 'ring-rose-500/50', 'bg-rose-950/30');
                    consultDoctorComment.focus();
                }
                if (doctorNoteAlert) {
                    doctorNoteAlert.classList.remove('hidden');
                }
                Toast.error("Doctor's Notes are mandatory before saving!");
                return;
            } else {
                if (consultDoctorComment) {
                    consultDoctorComment.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/50', 'bg-rose-950/30');
                }
                if (doctorNoteAlert) {
                    doctorNoteAlert.classList.add('hidden');
                }
            }

            // Collect prescription items
            const rows = prescriptionTableBody ? prescriptionTableBody.querySelectorAll('tr') : [];
            const items = [];
            rows.forEach(tr => {
                const searchInput = tr.querySelector('.med-search-input');
                const freqSelect = tr.querySelector('.freq-select');
                const daysInput = tr.querySelector('.days-input');
                const foodSelect = tr.querySelector('.food-select');
                const qtyInput = tr.querySelector('.qty-input');
                const pillBtns = tr.querySelectorAll('.timing-pill');

                if (!searchInput || !qtyInput) return;

                const searchVal = searchInput.value;
                if (!searchVal || searchVal.trim() === '') return;

                let medIdMatch = searchVal.match(/- #(\d+)$/);
                let medId = medIdMatch ? medIdMatch[1] : null;
                let medName = medIdMatch ? searchVal.replace(medIdMatch[0], '').trim() : searchVal.trim();

                // If user typed name without clicking datalist item, match against loaded inventory
                if (!medId && medName && inventoryMedicines && inventoryMedicines.length > 0) {
                    const matchedMed = inventoryMedicines.find(m => 
                        m.name.toLowerCase() === medName.toLowerCase() || 
                        (m.name + (m.generic_name ? ` (${m.generic_name})` : '')).toLowerCase() === medName.toLowerCase()
                    );
                    if (matchedMed) {
                        medId = matchedMed.id;
                    }
                }

                const qty = parseInt(qtyInput.value, 10) || 1;
                const days = parseInt(daysInput ? daysInput.value : '3', 10) || 1;
                const freqCode = freqSelect ? freqSelect.value : '1-0-1';
                const foodVal = foodSelect ? foodSelect.value : 'After Food';

                let fullInstruction = '';
                if (freqCode.startsWith('Apply') || foodVal.includes('External') || foodVal.includes('Affected Area') || foodVal.includes('Local Application')) {
                    fullInstruction = `${days} Days | ${freqCode} | ${foodVal}`;
                } else {
                    const activePillElements = Array.from(pillBtns || []).filter(b => b.classList.contains('bg-teal-500/20')).map(b => b.getAttribute('data-pill'));
                    const pillLabels = { 'M': 'Morning', 'A': 'Afternoon', 'E': 'Evening', 'N': 'Night' };
                    const timingStr = activePillElements.length > 0 ? activePillElements.map(p => pillLabels[p]).join(', ') : 'Morning & Evening';
                    fullInstruction = `${days} Days | ${timingStr} (${freqCode}) | ${foodVal}`;
                }

                if (medName && qty > 0) {
                    items.push({
                        medicine_id: medId ? parseInt(medId, 10) : null,
                        medicine_name: medName,
                        quantity: qty,
                        instructions: fullInstruction,
                        days: days,
                        timing: freqCode,
                        frequency: freqCode
                    });
                }
            });

            btnSubmitConsultation.disabled = true;
            btnSubmitConsultation.innerHTML = 'Saving...';

            try {
                const payload = {
                    patient_token: activeConsultPatient.token,
                    patient_mobile: activeConsultPatient.mobile,
                    patient_name: activeConsultPatient.patient_name,
                    age: activeConsultPatient.age,
                    symptoms: activeConsultPatient.symptoms,
                    doctor_comment: comment,
                    items: items
                };

                const res = await apiRequest('/prescriptions', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (res && res.success) {
                    Toast.success('Consultation & Prescription saved successfully!');
                    
                    // Reset inputs
                    if (consultPatientToken) consultPatientToken.value = '';
                    if (consultPatientDate) consultPatientDate.value = '';
                    if (consultPatientMobile) consultPatientMobile.value = '';
                    if (consultPatientName) consultPatientName.value = '';
                    if (consultPatientAge) consultPatientAge.value = '';
                    if (consultPatientIssues) consultPatientIssues.value = '';
                    if (consultDoctorComment) {
                        consultDoctorComment.value = '';
                        consultDoctorComment.classList.remove('border-rose-500', 'ring-2', 'ring-rose-500/50', 'bg-rose-950/30');
                    }
                    if (doctorNoteAlert) doctorNoteAlert.classList.add('hidden');
                    if (primarySearchInput) primarySearchInput.value = '';
                    
                    activeConsultPatient = null;

                    // Reset prescription rows with 1 fresh empty row
                    if (prescriptionTableBody) {
                        prescriptionTableBody.innerHTML = '';
                        addPrescriptionRow();
                    }

                    // Refresh bottom patient queue table
                    loadPatients();
                } else {
                    Toast.error(res?.message || 'Failed to submit prescription');
                }
            } catch (error) {
                console.error('Submit consultation error:', error);
                Toast.error(error.message || 'An error occurred while saving consultation');
            } finally {
                btnSubmitConsultation.disabled = false;
                btnSubmitConsultation.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Save Consultation & Prescription
        `;
            }
        });
    }


    // --- View Switching Logic (Consultation vs Patient Queue) ---
    function showConsultationView() {
        if (consultationSection) consultationSection.classList.remove('hidden');
        if (queueTableSection) queueTableSection.classList.add('hidden');

        if (navBtnConsultation) {
            navBtnConsultation.className = 'px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 text-teal-400 border border-slate-700 cursor-pointer';
        }
        if (navBtnQueue) {
            navBtnQueue.className = 'px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer';
        }
    }

    function showQueueView() {
        if (consultationSection) consultationSection.classList.add('hidden');
        if (queueTableSection) queueTableSection.classList.remove('hidden');

        if (navBtnQueue) {
            navBtnQueue.className = 'px-3 py-2 rounded-lg text-sm font-medium bg-slate-800 text-teal-400 border border-slate-700 flex items-center gap-1.5 cursor-pointer';
        }
        if (navBtnConsultation) {
            navBtnConsultation.className = 'px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer';
        }
        loadPatients();
    }

    if (navBtnConsultation) navBtnConsultation.addEventListener('click', showConsultationView);
    if (navBtnQueue) navBtnQueue.addEventListener('click', showQueueView);


    // --- Patient List Sub-component Logic ---
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', async () => {
            try {
                await PatientAPI.exportCSV({
                    search: state.search,
                    fromDate: state.fromDate,
                    toDate: state.toDate
                });
                Toast.success('Registered Patient Records CSV downloaded successfully.');
            } catch (error) {
                console.error('Error exporting CSV:', error);
                Toast.error('Failed to export CSV records.');
            }
        });
    }

    async function loadPatients() {
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        if (patientsTableBody) patientsTableBody.classList.add('opacity-40');
        if (emptyState) emptyState.classList.add('hidden');

        try {
            const response = await PatientAPI.getPatients(state);

            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            if (patientsTableBody) patientsTableBody.classList.remove('opacity-40');

            if (response && response.success) {
                renderTable(response.data || []);
                renderPagination(response.page || 1, response.totalPages || 1, response.total || 0);

                let infoStr = `Showing ${(response.data || []).length} of ${response.total || 0} patient records`;
                if (state.fromDate || state.toDate) {
                    if (state.fromDate && state.toDate) {
                        infoStr += ` (From ${state.fromDate} to ${state.toDate})`;
                    } else if (state.fromDate) {
                        infoStr += ` (From ${state.fromDate})`;
                    } else {
                        infoStr += ` (Up to ${state.toDate})`;
                    }
                }
                if (recordCountInfo) recordCountInfo.textContent = infoStr;

                if (!response.data || response.data.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                }
            } else {
                Toast.error(response?.message || 'Error loading patient records');
            }
        } catch (e) {
            console.error('Load patients error:', e);
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
            if (patientsTableBody) patientsTableBody.classList.remove('opacity-40');
        }
    }

    function renderTable(patients) {
        if (!patientsTableBody) return;
        patientsTableBody.innerHTML = '';

        (patients || []).forEach(patient => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-token', patient.token);
            tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/60 transition-colors cursor-pointer';

            const dateObj = new Date(patient.created_at);
            const formattedDate = dateObj.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });

            const isConsulted = !!(patient.doctor_name || patient.doctor_comment || patient.consultation_status);

            tr.innerHTML = `
        <td class="px-3.5 py-3 whitespace-nowrap">
          <span class="inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold text-teal-300 bg-teal-950/80 border border-teal-500/30 rounded-full font-mono shadow-sm">
            #${patient.token}
          </span>
        </td>
        <td class="px-3.5 py-3 whitespace-nowrap">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
              ${patient.patient_name ? patient.patient_name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div>
              <p class="text-xs font-semibold text-slate-100">${escapeHtml(patient.patient_name)}</p>
              <p class="text-[10px] text-slate-400">ID: OP-${patient.id}</p>
            </div>
          </div>
        </td>
        <td class="px-3.5 py-3 whitespace-nowrap text-xs text-slate-300">
          <div>${patient.age} yrs</div>
          <div class="font-mono text-[10px] text-cyan-300">${escapeHtml(patient.mobile)}</div>
        </td>
        <td class="px-3.5 py-3 text-xs text-slate-300 max-w-xs truncate" title="${escapeHtml(patient.symptoms)}">
          ${escapeHtml(patient.symptoms)}
        </td>
        <td class="px-3.5 py-3 text-xs text-slate-300 max-w-xs">
          ${isConsulted ? `
            <div class="flex items-center gap-1 font-semibold text-teal-400 text-xs">
              <svg class="w-3.5 h-3.5 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
              <span>${escapeHtml(patient.doctor_name || 'Dr. Specialist')}</span>
            </div>
            <div class="text-[11px] text-slate-300 truncate max-w-xs" title="${escapeHtml(patient.doctor_comment || '')}">
              ${patient.doctor_comment ? escapeHtml(patient.doctor_comment) : '<span class="italic text-slate-500">No notes recorded</span>'}
            </div>
            ${patient.medicine_count ? `<div class="text-[10px] text-cyan-400 font-mono">Rx: ${patient.medicine_count} medicine(s)</div>` : ''}
          ` : `
            <span class="text-[11px] text-slate-500 italic">Awaiting Doctor Consultation</span>
          `}
        </td>
        <td class="px-3.5 py-3 whitespace-nowrap text-xs">
          ${isConsulted ? `
            <span class="inline-flex items-center px-2.5 py-1 text-[10px] font-bold rounded-full border ${patient.consultation_status === 'Completed' || patient.consultation_status === 'Billed' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-teal-950/80 text-teal-300 border-teal-500/40 shadow-sm'}">
              ${(patient.consultation_status === 'Completed' || patient.consultation_status === 'Billed') ? 'Consulted & Billed' : 'Consulted'}
            </span>
          ` : `
            <span class="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-900 text-slate-400 border border-slate-700">
              Pending
            </span>
          `}
          <div class="text-slate-500 text-[10px] mt-0.5">${formattedDate}</div>
        </td>
      `;

            patientsTableBody.appendChild(tr);
        });

        // Attach click handlers to table rows to load consultation
        patientsTableBody.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', () => {
                const token = tr.getAttribute('data-token');
                if (token) {
                    if (primarySearchInput) primarySearchInput.value = token;
                    showConsultationView();
                    performPrimarySearch();
                }
            });
        });
    }

    function renderPagination(currentPage, totalPages, totalItems) {
        paginationControls.innerHTML = '';
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${currentPage === 1
            ? 'border-slate-800 text-slate-600 cursor-not-allowed'
            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`;
        prevBtn.innerHTML = '← Prev';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (state.page > 1) {
                state.page--;
                loadPatients();
            }
        });
        paginationControls.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                const pageBtn = document.createElement('button');
                pageBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${i === currentPage
                    ? 'bg-teal-600 text-white font-bold shadow-md'
                    : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`;
                pageBtn.textContent = i;
                pageBtn.addEventListener('click', () => {
                    state.page = i;
                    loadPatients();
                });
                paginationControls.appendChild(pageBtn);
            } else if (
                (i === 2 && currentPage > 3) ||
                (i === totalPages - 1 && currentPage < totalPages - 2)
            ) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'px-1 text-slate-500 text-xs self-center';
                ellipsis.textContent = '...';
                paginationControls.appendChild(ellipsis);
            }
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = `px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${currentPage === totalPages
            ? 'border-slate-800 text-slate-600 cursor-not-allowed'
            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`;
        nextBtn.innerHTML = 'Next →';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (state.page < totalPages) {
                state.page++;
                loadPatients();
            }
        });
        paginationControls.appendChild(nextBtn);
    }

    // Filters & Search for Table
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.search = e.target.value;
                state.page = 1;
                loadPatients();
            }, 300);
        });
    }

    function handleDateRangeChange() {
        state.fromDate = fromDateInput ? fromDateInput.value : '';
        state.toDate = toDateInput ? toDateInput.value : '';
        state.page = 1;

        if (state.fromDate || state.toDate) {
            clearDateBtn?.classList.remove('hidden');
        } else {
            clearDateBtn?.classList.add('hidden');
        }
        loadPatients();
    }

    if (fromDateInput) fromDateInput.addEventListener('change', handleDateRangeChange);
    if (toDateInput) toDateInput.addEventListener('change', handleDateRangeChange);

    if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
            if (fromDateInput) fromDateInput.value = '';
            if (toDateInput) toDateInput.value = '';
            state.fromDate = '';
            state.toDate = '';
            state.page = 1;
            clearDateBtn.classList.add('hidden');
            loadPatients();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'newest') {
                state.sortBy = 'created_at';
                state.order = 'DESC';
            } else if (val === 'oldest') {
                state.sortBy = 'created_at';
                state.order = 'ASC';
            } else if (val === 'token_asc') {
                state.sortBy = 'token';
                state.order = 'ASC';
            } else if (val === 'token_desc') {
                state.sortBy = 'token';
                state.order = 'DESC';
            } else if (val === 'name_asc') {
                state.sortBy = 'patient_name';
                state.order = 'ASC';
            }
            state.page = 1;
            loadPatients();
        });
    }

    if (limitSelect) {
        limitSelect.addEventListener('change', (e) => {
            state.limit = parseInt(e.target.value, 10);
            state.page = 1;
            loadPatients();
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initial load of patient records table on page load
    loadPatients();
    if (prescriptionTableBody && prescriptionTableBody.children.length === 0) {
        addPrescriptionRow();
    }
});

