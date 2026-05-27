/* ==========================================================================
   AUTOIMPORT PROTOTYPE - CORE APPLICATION CONTROLLER (JS)
   Interactive state, Spanish Tax Engine, Lodging Plan & Mock Scanner Flow
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // 1. STATE & GLOBAL CONFIGURATION
    // ==========================================================================
    const state = {
        currentTab: 'page-dashboard',
        activeCarId: null,
        
        // Vehicle Inputs
        price: 25000,
        co2: 135,
        power: 150,
        province: 'asturias',
        sellerInvoice: true, // true = Professional (Factura), false = Particular
        luxury: false,
        damaged: false,
        largeFamily: false,
        ageMonths: 36,
        km: 45000,
        
        // Logistics Inputs
        logisticsType: 'drive', // 'drive' or 'carrier'
        consumption: 6.5,
        fuelPrice: 1.72,
        passengers: 1,
        hotelNights: 2,
        hotelSearchCity: 'Munich, Alemania',
        
        // Upgraded Search module & AI properties
        selectedCars: [],
        loadedCarId: null,
        geminiApiKey: localStorage.getItem('gemini_api_key') || '',
        
        // Document & Checklist statuses
        uploadedDocs: {
            factura: false,
            coc: false,
            permit: false,
            itv: false
        },
        
        checklist: {
            'ger-1': false,
            'inspect': false,
            'ger-3': false,
            'ger-4': false,
            'esp-1': false,
            'esp-2': false,
            'esp-3': false,
            'esp-4': false
        }
    };

    // Spanish depreciation scale based on official BOE guidelines
    const getDepreciationRatio = (months) => {
        const years = months / 12;
        if (years <= 1) return 1.0;
        if (years <= 2) return 0.84;
        if (years <= 3) return 0.67;
        if (years <= 4) return 0.56;
        if (years <= 5) return 0.47;
        if (years <= 6) return 0.39;
        if (years <= 7) return 0.34;
        if (years <= 8) return 0.28;
        if (years <= 9) return 0.24;
        if (years <= 10) return 0.19;
        if (years <= 11) return 0.17;
        if (years <= 12) return 0.13;
        return 0.10; // Over 12 years, valuation is capped at 10%
    };

    // ITP (Transfer Tax) rates by Spanish Province
    const provinceITPRates = {
        asturias: 0.08,
        madrid: 0.04,
        catalunya: 0.05,
        andalucia: 0.04,
        valencia: 0.08,
        galicia: 0.08,
        paisvasco: 0.04
    };

    // Province Labels mapping
    const provinceLabels = {
        asturias: 'Asturias (8%)',
        madrid: 'Madrid (4%)',
        catalunya: 'Cataluña (5%)',
        andalucia: 'Andalucía (4%)',
        valencia: 'Comunidad Valenciana (8%)',
        galicia: 'Galicia (8%)',
        paisvasco: 'País Vasco (4%)'
    };

    // ==========================================================================
    // 2. DEVICE GENERAL LAYOUT INTERACTION
    // ==========================================================================
    
    // Status Bar Real-time Clock
    const updateClock = () => {
        const timeEl = document.getElementById('statusTime');
        if (timeEl) {
            const now = new Date();
            let hours = now.getHours();
            let minutes = now.getMinutes();
            hours = hours < 10 ? '0' + hours : hours;
            minutes = minutes < 10 ? '0' + minutes : minutes;
            timeEl.textContent = `${hours}:${minutes}`;
        }
    };
    updateClock();
    setInterval(updateClock, 60000);

    // Tab Router Switcher
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.app-page');

    const switchTab = (targetId) => {
        state.currentTab = targetId;
        
        // Toggle Nav Bar Active states
        navButtons.forEach(btn => {
            if (btn.getAttribute('data-target') === targetId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Toggle Screen Page Active states
        pages.forEach(page => {
            if (page.id === targetId) {
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });

        // If switching to calculator, update sliders & run dynamic math
        if (targetId === 'page-calculator') {
            updateCalculatorUI();
        }
        // If switching to travel panel, update travel UI calculations
        if (targetId === 'page-travel') {
            updateTravelUI();
        }
    };

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-target');
            switchTab(target);
        });
    });

    // Back to Home Back-button Click Handlers
    const backHomeButtons = document.querySelectorAll('.btn-back-home');
    backHomeButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchTab('page-dashboard');
        });
    });

    // Dashboard "Ver Todo" link jumps to Checklist Tab
    document.getElementById('btn-peek-checklist').addEventListener('click', () => {
        switchTab('page-checklist');
    });

    // ==========================================================================
    // MODULE 3: COST ENGINE, AUTO-POPULATION & DYNAMIC MODALS
    // ==========================================================================

    const syncActiveCarToCalculator = (carId) => {
        state.activeCarId = carId;
        
        // Sync Technical Review dropdown
        const inspectSelect = document.getElementById('inspect-car-select');
        if (inspectSelect) {
            inspectSelect.value = carId || "";
        }

        if (!carId) {
            // Revert active label and clear
            const activeDesc = document.getElementById('breakdown-active-car-desc');
            if (activeDesc) {
                activeDesc.textContent = state.language === 'en'
                    ? 'Vehicle: None selected (custom manual values)'
                    : state.language === 'de'
                    ? 'Fahrzeug: Keines ausgewählt (manuelle Eingabe)'
                    : 'Vehículo: Ninguno seleccionado (introducido manualmente)';
            }
            return;
        }

        const car = state.selectedCars.find(c => c.id === carId);
        if (car) {
            // Auto-populate Pre-Purchase inspection form
            const inpBrand = document.getElementById('inspect-brand');
            const inpModel = document.getElementById('inspect-model');
            const inpLink = document.getElementById('inspect-link');
            const inpLocation = document.getElementById('inspect-location');

            if (inpBrand) inpBrand.value = car.brand;
            if (inpModel) inpModel.value = car.model;
            
            const mockLink = `https://www.mobile.de/coche/${car.brand.toLowerCase()}-${car.model.toLowerCase().replace(/[^a-z0-9]/g, '-')}/${car.id}`;
            if (inpLink) inpLink.value = mockLink;

            let mockLoc = 'Berlin, 10115';
            if (car.brand.toLowerCase().includes('audi')) mockLoc = 'Munich, 80331';
            else if (car.brand.toLowerCase().includes('bmw')) mockLoc = 'Stuttgart, 70173';
            else if (car.brand.toLowerCase().includes('mercedes')) mockLoc = 'Sindelfingen, 71063';
            else if (car.brand.toLowerCase().includes('volkswagen') || car.brand.toLowerCase().includes('vw')) mockLoc = 'Wolfsburg, 38440';
            
            if (inpLocation) inpLocation.value = mockLoc;

            // Auto-populate Calculator
            state.price = car.price;
            state.co2 = car.co2;
            state.power = car.power;
            state.km = car.km;
            state.consumption = car.consumption;
            
            // Sync Calculator Sliders and Inputs
            updateCalculatorUI();

            // Auto-populate Travel Pickup Location & Consumption
            const inpOrigin = document.getElementById('travel-origin');
            if (inpOrigin) {
                inpOrigin.value = mockLoc;
            }
            const sliderCons = document.getElementById('travel-consumption');
            if (sliderCons) {
                sliderCons.value = car.consumption;
            }
            
            // Re-run travel updates if applicable
            updateTravelUI();

            // Update breakdown modal active vehicle description
            const activeDesc = document.getElementById('breakdown-active-car-desc');
            if (activeDesc) {
                activeDesc.textContent = `${state.language === 'en' ? 'Vehicle' : state.language === 'de' ? 'Fahrzeug' : 'Vehículo'}: ${car.brand} ${car.model} (${car.price.toLocaleString('es-ES')} €)`;
            }
        }
    };

    const updateCostBreakdownUI = () => {
        const total = state.computedTotal || 0;
        const carPrice = state.price || 0;
        const taxes = state.computedTaxes || 0;
        const logistics = state.computedLogistics || 0;
        const admin = state.computedAdmin || 0;

        // Sync Global cost pills
        const costPills = document.querySelectorAll('.global-cost-pill .global-cost-val');
        costPills.forEach(pill => {
            pill.textContent = `${total.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
        });

        // Sync Modal main values
        const breakdownTotalVal = document.getElementById('breakdown-total-val');
        if (breakdownTotalVal) {
            breakdownTotalVal.textContent = `${total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        }

        const breakdownValCar = document.getElementById('breakdown-val-car');
        if (breakdownValCar) breakdownValCar.textContent = `${carPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        const breakdownValTaxes = document.getElementById('breakdown-val-taxes');
        if (breakdownValTaxes) breakdownValTaxes.textContent = `${taxes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        // modelo 576 vs ITP breakdown
        const depreciationRatio = getDepreciationRatio(state.ageMonths);
        let depreciatedBase = state.price * depreciationRatio;
        if (state.damaged) depreciatedBase = depreciatedBase * 0.75;

        let taxRate = 0;
        if (state.co2 > 120 && state.co2 <= 159) taxRate = 0.0475;
        else if (state.co2 >= 160 && state.co2 <= 199) taxRate = 0.0975;
        else if (state.co2 >= 200) taxRate = 0.1475;
        
        let registrationTax = depreciatedBase * taxRate;
        if (state.luxury) registrationTax += (state.price * 0.03);
        if (state.largeFamily) registrationTax = registrationTax * 0.5;

        let transferTax = 0;
        if (!state.sellerInvoice) {
            const itpRate = provinceITPRates[state.province] || 0.04;
            transferTax = depreciatedBase * itpRate;
        }

        const bVal576 = document.getElementById('breakdown-val-576');
        if (bVal576) bVal576.textContent = `${registrationTax.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        
        const bValITP = document.getElementById('breakdown-val-itp');
        if (bValITP) bValITP.textContent = `${transferTax.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        // Logistics Category
        const breakdownValLogistics = document.getElementById('breakdown-val-logistics');
        if (breakdownValLogistics) breakdownValLogistics.textContent = `${logistics.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        // Logistics breakdown items in details box
        const logisticsDetailsBox = document.getElementById('breakdown-logistics-details-box');
        if (logisticsDetailsBox) {
            if (state.logisticsType === 'drive') {
                const flight = 120.00;
                const tolls = 95.00;
                const tempPlatesInsurance = 250.00;
                const travelFuel = ((2100 * state.consumption) / 100) * state.fuelPrice;
                const travelLodging = state.hotelNights * 85.00;

                const flightLabel = state.language === 'en' ? 'Flight to Germany' : state.language === 'de' ? 'Flug nach Deutschland' : 'Vuelo a Alemania';
                const platesLabel = state.language === 'en' ? 'Provisional plates & Ins.' : state.language === 'de' ? 'Kurzzeitkennzeichen & Vers.' : 'Placas temporales & Seguro';
                const tollsLabel = state.language === 'en' ? 'Highway tolls' : state.language === 'de' ? 'Mautgebühren' : 'Peajes de autopista';
                const fuelLabel = state.language === 'en' ? 'Fuel' : state.language === 'de' ? 'Kraftstoff' : 'Combustible';
                const lodgingLabel = state.language === 'en' ? 'Hotel nights' : state.language === 'de' ? 'Hotelübernachtungen' : 'Noches de hotel';

                logisticsDetailsBox.innerHTML = `
                    <div class="sub-detail-row"><span>${flightLabel}:</span> <strong>${flight.toFixed(2)} €</strong></div>
                    <div class="sub-detail-row"><span>${platesLabel}:</span> <strong>${tempPlatesInsurance.toFixed(2)} €</strong></div>
                    <div class="sub-detail-row"><span>${tollsLabel}:</span> <strong>${tolls.toFixed(2)} €</strong></div>
                    <div class="sub-detail-row"><span>${fuelLabel} (2100 km):</span> <strong>${travelFuel.toFixed(2)} €</strong></div>
                    <div class="sub-detail-row"><span>${lodgingLabel} (${state.hotelNights}):</span> <strong>${travelLodging.toFixed(2)} €</strong></div>
                `;
            } else {
                const carrierLabel = state.language === 'en' ? 'Professional Car Carrier' : state.language === 'de' ? 'Professioneller Autotransporter' : 'Portacoches Profesional';
                logisticsDetailsBox.innerHTML = `
                    <div class="sub-detail-row"><span>${carrierLabel}:</span> <strong>${logistics.toFixed(2)} €</strong></div>
                `;
            }
        }

        // Administrative fees Category
        const breakdownValFees = document.getElementById('breakdown-val-fees');
        if (breakdownValFees) breakdownValFees.textContent = `${admin.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        // Update visual segments progress bars
        const segCar = document.getElementById('gauge-seg-car');
        const segTaxes = document.getElementById('gauge-seg-taxes');
        const segLogistics = document.getElementById('gauge-seg-logistics');
        const segFees = document.getElementById('gauge-seg-fees');

        if (total > 0) {
            const pCar = (carPrice / total) * 100;
            const pTaxes = (taxes / total) * 100;
            const pLogistics = (logistics / total) * 100;
            const pFees = (admin / total) * 100;

            if (segCar) segCar.style.width = `${pCar}%`;
            if (segTaxes) segTaxes.style.width = `${pTaxes}%`;
            if (segLogistics) segLogistics.style.width = `${pLogistics}%`;
            if (segFees) segFees.style.width = `${pFees}%`;
        }
    };

    // Global Cost Pills Trigger detailed modal
    const costPillsElements = document.querySelectorAll('.global-cost-pill');
    costPillsElements.forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            const modal = document.getElementById('cost-breakdown-modal');
            if (modal) {
                updateCostBreakdownUI();
                modal.style.display = 'block';
            }
        });
    });

    const btnCloseBreakdown = document.getElementById('btn-close-breakdown');
    if (btnCloseBreakdown) {
        btnCloseBreakdown.addEventListener('click', () => {
            const modal = document.getElementById('cost-breakdown-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    const btnPrintBudget = document.getElementById('btn-print-budget');
    if (btnPrintBudget) {
        btnPrintBudget.addEventListener('click', () => {
            const printText = state.language === 'en'
                ? 'Simulating PDF budget export... Download ready!'
                : state.language === 'de'
                ? 'Simuliere PDF-Budgetexport... Download bereit!'
                : 'Simulando exportación de presupuesto a PDF... ¡Descarga lista!';
            alert(printText);
        });
    }

    // ==========================================================================
    // 3. MANZA AUTOGERMA VEHICLE COMPARATOR & GEMINI AI ENGINE
    // ==========================================================================
    
    // 4 popular German cars presets for easy testing
    const presetCars = [
        { id: 'preset-1', brand: 'Audi', model: 'A4 Avant 2.0 TDI', year: 2021, price: 24500, km: 45000, co2: 119, power: 150, consumption: 4.8, photo: 'familiar', selected: true },
        { id: 'preset-2', brand: 'BMW', model: '320d Touring', year: 2022, price: 29800, km: 38000, co2: 124, power: 190, consumption: 4.6, photo: 'familiar', selected: true },
        { id: 'preset-3', brand: 'Mercedes-Benz', model: 'C220d Estate', year: 2021, price: 28900, km: 52000, co2: 130, power: 200, consumption: 4.9, photo: 'sedan', selected: false },
        { id: 'preset-4', brand: 'Volkswagen', model: 'Golf VII 2.0 TDI', year: 2020, price: 18200, km: 68000, co2: 109, power: 150, consumption: 4.2, photo: 'compact', selected: false }
    ];

    // Helper: calculate taxes for individual vehicles in the comparison matrix
    const calculateTaxesForCar = (car) => {
        // Modelo 576 (Registration tax)
        const depRatio = getDepreciationRatio(state.ageMonths);
        let baseVal = car.price * depRatio;
        if (state.damaged) baseVal *= 0.75;
        
        let rate = 0;
        if (car.co2 > 120 && car.co2 <= 159) rate = 0.0475;
        else if (car.co2 >= 160 && car.co2 <= 199) rate = 0.0975;
        else if (car.co2 >= 200) rate = 0.1475;
        
        let mod576 = baseVal * rate;
        if (state.luxury) mod576 += (car.price * 0.03);
        if (state.largeFamily) mod576 *= 0.5;
        
        // ITP (Transfer tax)
        let itp = 0;
        if (!state.sellerInvoice) {
            const itpRate = provinceITPRates[state.province] || 0.04;
            itp = baseVal * itpRate;
        }
        
        // Estimated travel logistics
        let routeCost = 950.00; // Carrier
        if (state.logisticsType === 'drive') {
            const fuel = ((2100 * car.consumption) / 100) * state.fuelPrice;
            const lodging = state.hotelNights * 85.00;
            routeCost = 120.00 + 95.00 + 250.00 + fuel + lodging;
        }
        
        return {
            mod576: mod576,
            itp: itp,
            totalTaxes: mod576 + itp,
            routeCost: routeCost,
            totalImportation: mod576 + itp + routeCost + 302.50 + 150.00 + 152.50 // taxes + route + management + ITV + traffic
        };
    };

    // Render Panel List
    const renderCarList = () => {
        const list = document.getElementById('compare-cars-list');
        const placeholder = document.getElementById('compare-cars-placeholder');
        
        if (!list) return;
        
        // Clear old cards
        list.querySelectorAll('.selected-car-card').forEach(el => el.remove());
        
        if (state.selectedCars.length === 0) {
            placeholder.style.display = 'flex';
            document.getElementById('btn-trigger-comparison').disabled = true;
            document.getElementById('car-count-label').textContent = '0 / 4 Coches';
            return;
        }
        
        placeholder.style.display = 'none';
        
        state.selectedCars.forEach(car => {
            const card = document.createElement('div');
            card.className = `selected-car-card ${car.selected ? 'selected-for-compare' : ''}`;
            card.setAttribute('data-id', car.id);
            
            card.innerHTML = `
                <div class="car-chk-area">
                    <input type="checkbox" class="car-select-checkbox" ${car.selected ? 'checked' : ''}>
                </div>
                <div class="car-img-thumb ${car.photo || 'sedan'}"></div>
                <div class="car-card-details">
                    <h4>${car.brand} ${car.model}</h4>
                    <p>${car.year} • ${car.price.toLocaleString('es-ES')} € • ${car.power} CV</p>
                    <div class="car-card-meta">
                        <span class="car-meta-tag">${car.km.toLocaleString('es-ES')} km</span>
                        <span class="car-meta-tag">${car.co2} g/km</span>
                        <span class="car-meta-tag">${car.consumption.toFixed(1)} L/100</span>
                    </div>
                </div>
                <button class="btn-remove-car">&times;</button>
            `;
            
            // Checkbox change listener
            card.querySelector('.car-select-checkbox').addEventListener('change', (e) => {
                car.selected = e.target.checked;
                if (car.selected) {
                    card.classList.add('selected-for-compare');
                    syncActiveCarToCalculator(car.id);
                } else {
                    card.classList.remove('selected-for-compare');
                    if (state.activeCarId === car.id) {
                        syncActiveCarToCalculator(null);
                    }
                }
                updateCompareButtonState();
            });
            
            // Remove button listener
            card.querySelector('.btn-remove-car').addEventListener('click', () => {
                state.selectedCars = state.selectedCars.filter(c => c.id !== car.id);
                renderCarList();
            });
            
            list.appendChild(card);
        });
        
        document.getElementById('car-count-label').textContent = `${state.selectedCars.length} / 4 Coches`;
        updateCompareButtonState();
        renderCalculatorSuggestions();
        syncInspectCarSelect();
    };

    const updateCompareButtonState = () => {
        const selectedCount = state.selectedCars.filter(c => c.selected).length;
        const btn = document.getElementById('btn-trigger-comparison');
        if (btn) btn.disabled = selectedCount < 2;
    };

    // Add Preset Cars click
    const btnLoadPresets = document.getElementById('btn-load-presets');
    if (btnLoadPresets) {
        btnLoadPresets.addEventListener('click', () => {
            state.selectedCars = JSON.parse(JSON.stringify(presetCars));
            // SELECCIÓN AUTOMÁTICA DE TODOS LOS COCHES DE PRUEBA PARA HABILITAR LA IA DE INMEDIATO
            if (state.selectedCars.length > 0) {
                state.selectedCars.forEach((c) => c.selected = true);
            }
            renderCarList();
            if (state.selectedCars.length > 0) {
                syncActiveCarToCalculator(state.selectedCars[0].id);
            }
        });
    }

    // Manual Add Form Toggle binds
    const btnToggleForm = document.getElementById('btn-toggle-add-form');
    const addCarForm = document.getElementById('add-car-form');
    
    if (btnToggleForm && addCarForm) {
        btnToggleForm.addEventListener('click', () => {
            addCarForm.style.display = addCarForm.style.display === 'none' ? 'block' : 'none';
        });
    }

    const btnCancelAddCar = document.getElementById('btn-cancel-add-car');
    if (btnCancelAddCar && addCarForm) {
        btnCancelAddCar.addEventListener('click', () => {
            addCarForm.style.display = 'none';
        });
    }

    // Submit Custom Car Action
    const btnSubmitAddCar = document.getElementById('btn-submit-add-car');
    if (btnSubmitAddCar) {
        btnSubmitAddCar.addEventListener('click', () => {
            if (state.selectedCars.length >= 4) {
                alert('El panel soporta un máximo de 4 coches a la vez.');
                return;
            }
            
            const brand = document.getElementById('add-brand').value.trim();
            const model = document.getElementById('add-model').value.trim();
            const price = parseInt(document.getElementById('add-price').value) || 20000;
            const year = parseInt(document.getElementById('add-year').value) || 2021;
            const km = parseInt(document.getElementById('add-km').value) || 45000;
            const co2 = parseInt(document.getElementById('add-co2').value) || 120;
            const consumption = parseFloat(document.getElementById('add-consumption').value) || 5.0;
            const power = parseInt(document.getElementById('add-power').value) || 150;
            const photo = document.getElementById('add-photo-preset').value;
            
            if (!brand || !model) {
                alert('Por favor, rellena al menos Marca y Modelo.');
                return;
            }
            
            const newCar = {
                id: 'custom-' + Date.now(),
                brand, model, year, price, km, co2, power, consumption, photo,
                selected: true
            };
            
            state.selectedCars.push(newCar);
            renderCarList();
            if (addCarForm) addCarForm.style.display = 'none';
        });
    }

    // NeedCarHelp Inspection Form bindings (Reused & Synced)
    const inspectionForm = document.getElementById('inspection-form');
    const requestInspectionBtn = document.getElementById('btn-request-inspection');
    const bookingBox = document.getElementById('booking-box');
    const bookingSuccess = document.getElementById('booking-success');
    const resetInspectionBtn = document.getElementById('btn-reset-inspection');

    if (requestInspectionBtn) {
        requestInspectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const brand = document.getElementById('inspect-brand').value;
            const model = document.getElementById('inspect-model').value;
            const link = document.getElementById('inspect-link').value;
            const location = document.getElementById('inspect-location').value;

            if (!brand || !model || !link || !location) {
                alert('Por favor, rellena todos los campos para realizar la solicitud.');
                return;
            }

            requestInspectionBtn.textContent = 'Enviando solicitud...';
            requestInspectionBtn.disabled = true;

            setTimeout(() => {
                bookingBox.style.display = 'none';
                bookingSuccess.style.display = 'block';
                
                state.checklist['inspect'] = true;
                const chkInspect = document.getElementById('chk-inspect');
                if (chkInspect) chkInspect.checked = true;
                updateProgress();

                requestInspectionBtn.textContent = 'Solicitar Inspección';
                requestInspectionBtn.disabled = false;
            }, 1200);
        });
    }

    if (resetInspectionBtn) {
        resetInspectionBtn.addEventListener('click', () => {
            bookingSuccess.style.display = 'none';
            bookingBox.style.display = 'block';
            if (inspectionForm) inspectionForm.reset();
            
            // Clear selected reviewer and draft email box
            selectedReviewerId = null;
            const draftBox = document.getElementById('inspect-email-draft-box');
            if (draftBox) draftBox.style.display = 'none';
            
            // Re-render suggestions to initial state
            updateReviewerRecommendations();
        });
    }

    // ==========================================================================
    // MODULE 2: PRE-PURCHASE TECHNICAL REVIEW OPTIONS & MAIL DRAFTS
    // ==========================================================================
    const reviewOptions = [
        {
            id: 'rev-needcarhelp',
            name: 'NeedCarHelp (Español)',
            tagline: 'Mecánicos expertos de habla hispana',
            desc: 'Se desplazan a cualquier punto de Alemania. Te envían un informe de 150+ puntos, fotos y vídeos detallados.',
            email: 'info@needcarhelp.es',
            cost: '250 €',
            region: 'Toda Alemania',
            matchCP: '',
            matchKeyword: 'alemania',
            logoColor: '#22c55e'
        },
        {
            id: 'rev-tuvsued',
            name: 'TÜV SÜD Gebrauchtwagen Check',
            tagline: 'Inspección técnica oficial (Líder en el Sur)',
            desc: 'Servicio oficial de alta confianza. Ideal para vehículos ubicados en Munich, Stuttgart o Nuremberg.',
            email: 'gebrauchtwagencheck.south@tuev-sued.de',
            cost: '140 €',
            region: 'Sur de Alemania (Baviera/Stuttgart)',
            matchCP: '8', // Munich/Bavaria starts with 8
            matchKeyword: 'munich',
            logoColor: '#3b82f6'
        },
        {
            id: 'rev-dekra',
            name: 'DEKRA Gebrauchtwagensiegel',
            tagline: 'Red de talleres más extensa de Alemania',
            desc: 'Inspección rigurosa e independiente con sello de calidad DEKRA. Perfecto para cualquier código postal.',
            email: 'service.gebrauchtcheck@dekra.com',
            cost: '120 €',
            region: 'Toda Alemania (Centro y Norte)',
            matchCP: '2', // Hamburg / North starts with 2
            matchKeyword: 'hamburgo',
            logoColor: '#10b981'
        },
        {
            id: 'rev-adac',
            name: 'ADAC Gebrauchtwagenprüfung',
            tagline: 'El club automovilístico más grande de Europa',
            desc: 'Revisión técnica minuciosa realizada por técnicos del club oficial ADAC.',
            email: 'pruefzentren@adac.de',
            cost: '110 €',
            region: 'Grandes Ciudades Alemanas',
            matchCP: '1', // Berlin / East starts with 1
            matchKeyword: 'berlin',
            logoColor: '#f59e0b'
        }
    ];
    let selectedReviewerId = null;

    // Populate dropdown with compared cars
    const syncInspectCarSelect = () => {
        const select = document.getElementById('inspect-car-select');
        if (!select) return;
        
        const manualOptionText = state.language === 'en' 
            ? '-- Enter details manually or choose car --'
            : state.language === 'de'
            ? '-- Details manuell eingeben oder Auto wählen --'
            : '-- Introducir datos manualmente o elegir coche --';
            
        select.innerHTML = `<option value="">${manualOptionText}</option>`;
        
        const checkedCars = state.selectedCars.filter(c => c.selected);
        
        checkedCars.forEach(car => {
            const opt = document.createElement('option');
            opt.value = car.id;
            opt.textContent = `${car.brand} ${car.model} (${car.price.toLocaleString('es-ES')} €)`;
            select.appendChild(opt);
        });
        
        // Update selection labels
        const lblSelect = document.getElementById('lbl-inspect-car-select');
        if (lblSelect) {
            lblSelect.textContent = state.language === 'en'
                ? 'Select car from panel (optional)'
                : state.language === 'de'
                ? 'Auto aus dem Panel auswählen (optional)'
                : 'Seleccionar coche del panel (opcional)';
        }
    };

    const inspectCarSelect = document.getElementById('inspect-car-select');
    if (inspectCarSelect) {
        inspectCarSelect.addEventListener('change', (e) => {
            const carId = e.target.value;
            syncActiveCarToCalculator(carId);
            
            if (carId === '') {
                document.getElementById('inspect-brand').value = '';
                document.getElementById('inspect-model').value = '';
                document.getElementById('inspect-link').value = '';
                document.getElementById('inspect-location').value = '';
                updateReviewerRecommendations();
                
                const draftBox = document.getElementById('inspect-email-draft-box');
                if (draftBox) draftBox.style.display = 'none';
                return;
            }
            
            updateReviewerRecommendations();
            
            // Update active email draft if reviewer is selected
            if (selectedReviewerId) {
                const activeReviewer = reviewOptions.find(r => r.id === selectedReviewerId);
                if (activeReviewer) generateEmailDraft(activeReviewer);
            }
        });
    }

    // Filter and update reviewer recommendation cards
    const updateReviewerRecommendations = () => {
        const locationInput = document.getElementById('inspect-location');
        const searchInput = document.getElementById('inspect-search-input');
        const list = document.getElementById('reviewers-cards-list');
        
        if (!list) return;
        
        const locVal = locationInput ? locationInput.value.toLowerCase().trim() : '';
        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
        
        let postcodePrefix = '';
        const cpMatch = locVal.match(/\b\d{5}\b/);
        if (cpMatch) {
            postcodePrefix = cpMatch[0].charAt(0);
        } else {
            const anyDigit = locVal.match(/\b\d/);
            if (anyDigit) postcodePrefix = anyDigit[0];
        }
        
        let filtered = reviewOptions;
        if (searchVal !== '') {
            filtered = reviewOptions.filter(opt => 
                opt.name.toLowerCase().includes(searchVal) ||
                opt.tagline.toLowerCase().includes(searchVal) ||
                opt.desc.toLowerCase().includes(searchVal) ||
                opt.region.toLowerCase().includes(searchVal)
            );
        }
        
        list.innerHTML = '';
        
        if (filtered.length === 0) {
            const emptyMsg = state.language === 'en'
                ? `No reviewers found for "${searchVal}"`
                : state.language === 'de'
                ? `Keine Prüfer gefunden für "${searchVal}"`
                : `No se encontraron revisores para "${searchVal}"`;
            list.innerHTML = `<div class="empty-list-placeholder" style="padding: 10px; text-align: center; font-size: 11px; color: var(--text-muted);">${emptyMsg}</div>`;
            return;
        }
        
        const lang = state.language || 'es';
        const dict = translations[lang] || translations['es'];
        
        filtered.forEach(opt => {
            let isRecommendedLoc = false;
            let isRecommendedLang = false;
            
            if (opt.id === 'rev-needcarhelp') {
                isRecommendedLang = true;
            }
            
            if (postcodePrefix !== '') {
                if (opt.matchCP && postcodePrefix === opt.matchCP) {
                    isRecommendedLoc = true;
                }
            } else if (locVal !== '') {
                if (opt.matchKeyword && locVal.includes(opt.matchKeyword)) {
                    isRecommendedLoc = true;
                }
            }
            
            const card = document.createElement('div');
            let extraClass = '';
            
            if (selectedReviewerId === opt.id) {
                extraClass = 'selected-reviewer';
            } else if (isRecommendedLoc) {
                extraClass = 'recommended-reviewer';
            } else if (isRecommendedLang) {
                extraClass = 'recommended-lang-reviewer';
            }
            
            card.className = `reviewer-card ${extraClass}`;
            
            const regionLabel = lang === 'en' ? 'Region' : lang === 'de' ? 'Region' : 'Región';
            const costLabel = lang === 'en' ? 'Approx. Price' : lang === 'de' ? 'Ca. Preis' : 'Precio Aprox.';
            
            card.innerHTML = `
                <div class="reviewer-card-header">
                    <h4>${opt.name}</h4>
                    <span class="reviewer-badge" style="border-left: 3px solid ${opt.logoColor};">${opt.cost}</span>
                </div>
                <div class="reviewer-card-tagline">${opt.tagline}</div>
                <div class="reviewer-card-desc">${opt.desc}</div>
                <div class="reviewer-card-footer">
                    <span>${regionLabel}: <strong>${opt.region}</strong></span>
                    <span>${costLabel}: <strong>${opt.cost}</strong></span>
                </div>
            `;
            
            card.addEventListener('click', () => {
                selectedReviewerId = opt.id;
                updateReviewerRecommendations();
                generateEmailDraft(opt);
            });
            
            list.appendChild(card);
        });
    };

    // Generate dynamic pre-filled mail drafts
    const generateEmailDraft = (reviewer) => {
        const draftBox = document.getElementById('inspect-email-draft-box');
        if (!draftBox) return;
        
        const brand = document.getElementById('inspect-brand').value.trim() || '[Marca]';
        const model = document.getElementById('inspect-model').value.trim() || '[Modelo]';
        const link = document.getElementById('inspect-link').value.trim() || '[Enlace del Anuncio]';
        const location = document.getElementById('inspect-location').value.trim() || '[Ubicación]';
        
        const lang = state.language || 'es';
        
        let subject = '';
        let body = '';
        
        if (reviewer.id === 'rev-needcarhelp') {
            subject = `Solicitud de revisión pre-compra - ${brand} ${model}`;
            body = `Hola NeedCarHelp,

Me gustaría solicitar una revisión técnica pre-compra para el siguiente vehículo en Alemania:

Vehículo: ${brand} ${model}
Ubicación: ${location}
Enlace del anuncio: ${link}

Quedo a la espera de sus comentarios para coordinar el presupuesto y la visita técnica del mecánico.

Un saludo cordial,
[Su Nombre]`;
        } else {
            // German reviewers get formal German request template
            subject = `Anfrage Gebrauchtwagen-Check: ${brand} ${model}`;
            body = `Sehr geehrte Damen und Herren,

hiermit möchte ich einen Gebrauchtwagen-Check (technische Fahrzeugprüfung vor dem Kauf) für folgendes Fahrzeug anfragen:

Fahrzeug: ${brand} ${model}
Standort: ${location}
Inserat-Link: ${link}

Bitte teilen Sie mir mit, ob Sie dieses Fahrzeug an diesem Standort prüfen können, wie hoch die Kosten sind und wann eine Besichtigung möglich wäre.

Mit freundlichen Grüßen,
[Ihr Name]`;
        }
        
        document.getElementById('draft-to').textContent = reviewer.email;
        document.getElementById('draft-subject').textContent = subject;
        document.getElementById('draft-body').textContent = body;
        
        const mailtoUrl = `mailto:${reviewer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const sendBtn = document.getElementById('btn-send-email-mailto');
        if (sendBtn) {
            sendBtn.href = mailtoUrl;
        }
        
        draftBox.style.display = 'block';
    };

    // Real-time hook for location recommendation
    const inspectLocation = document.getElementById('inspect-location');
    if (inspectLocation) {
        inspectLocation.addEventListener('input', () => {
            updateReviewerRecommendations();
            if (selectedReviewerId) {
                const activeReviewer = reviewOptions.find(r => r.id === selectedReviewerId);
                if (activeReviewer) generateEmailDraft(activeReviewer);
            }
        });
    }

    // Real-time search filter for reviewers
    const inspectSearchInput = document.getElementById('inspect-search-input');
    if (inspectSearchInput) {
        inspectSearchInput.addEventListener('input', () => {
            updateReviewerRecommendations();
        });
    }

    // Clear search button
    const btnInspectClearSearch = document.getElementById('btn-inspect-clear-search');
    if (btnInspectClearSearch && inspectSearchInput) {
        btnInspectClearSearch.addEventListener('click', () => {
            inspectSearchInput.value = '';
            updateReviewerRecommendations();
        });
    }

    // Real-time synchronization for form changes
    const inspectInputs = ['inspect-brand', 'inspect-model', 'inspect-link'];
    inspectInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                if (selectedReviewerId) {
                    const activeReviewer = reviewOptions.find(r => r.id === selectedReviewerId);
                    if (activeReviewer) generateEmailDraft(activeReviewer);
                }
            });
        }
    });

    // Initialize reviewer suggestions on startup
    updateReviewerRecommendations();

    // BIND PROFILE ADJUSTMENTS SETTINGS MODAL
    const triggerProfile = document.getElementById('trigger-profile');
    const settingsModal = document.getElementById('settings-modal');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    
    if (triggerProfile && settingsModal) {
        triggerProfile.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            document.getElementById('settings-gemini-key').value = state.geminiApiKey;
        });
    }
    
    if (btnCloseSettings && settingsModal) {
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }
    
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            const key = document.getElementById('settings-gemini-key').value.trim();
            state.geminiApiKey = key;
            localStorage.setItem('gemini_api_key', key);
            settingsModal.style.display = 'none';
            alert('Ajustes y API Key de Gemini guardados.');
        });
    }

    // BIND IA COMPARISON TRIGGERS & MODAL VIEW
    const comparisonModal = document.getElementById('comparison-modal');
    const btnCloseComparison = document.getElementById('btn-close-comparison');
    
    if (btnCloseComparison && comparisonModal) {
        btnCloseComparison.addEventListener('click', () => {
            comparisonModal.style.display = 'none';
        });
    }

    // Technical comparison matrix rendering logic
    const renderComparisonMatrix = () => {
        const table = document.getElementById('matrix-table');
        if (!table) return;
        
        const checkedCars = state.selectedCars.filter(c => c.selected);
        if (checkedCars.length < 2) return;
        
        // Calculate dynamic tax/route values
        const details = checkedCars.map(c => {
            return {
                car: c,
                calc: calculateTaxesForCar(c)
            };
        });
        
        // Find best metrics to highlight winners (Green color)
        const minPrice = Math.min(...checkedCars.map(c => c.price));
        const minCO2 = Math.min(...checkedCars.map(c => c.co2));
        const minConsumption = Math.min(...checkedCars.map(c => c.consumption));
        const minTaxes = Math.min(...details.map(d => d.calc.totalTaxes));
        const minTotalImport = Math.min(...details.map(d => d.calc.totalImportation));
        const minCombinedCost = Math.min(...details.map(d => d.car.price + d.calc.totalImportation));
        
        // Construct table header (incorporating dynamic activation button)
        let headHTML = `<tr><th class="matrix-row-title">Atributo</th>`;
        checkedCars.forEach(c => {
            headHTML += `<th>${c.brand}<br><small>${c.model}</small><br><button class="btn btn-secondary btn-sm mt-1 btn-activate-matrix" data-id="${c.id}" style="height: 22px; padding: 0 6px; font-size: 9.5px; border-radius: 4px; display: inline-flex; width: auto; width: 68px; margin: 4px auto 0 auto; color: #fff;">Cargar</button></th>`;
        });
        headHTML += '</tr>';
        
        // Construct table rows (including combined grand total row)
        let bodyHTML = `
            <tr>
                <td class="matrix-row-title">Precio Coche</td>
                ${checkedCars.map(c => `<td class="${c.price === minPrice ? 'matrix-winner-val' : ''}">${c.price.toLocaleString('es-ES')} €</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Año</td>
                ${checkedCars.map(c => `<td>${c.year}</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Kilometraje</td>
                ${checkedCars.map(c => `<td>${c.km.toLocaleString('es-ES')} km</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Potencia</td>
                ${checkedCars.map(c => `<td>${c.power} CV</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">CO₂ (g/km)</td>
                ${checkedCars.map(c => `<td class="${c.co2 === minCO2 ? 'matrix-winner-val' : ''}">${c.co2} g</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Consumo Mixto</td>
                ${checkedCars.map(c => `<td class="${c.consumption === minConsumption ? 'matrix-winner-val' : ''}">${c.consumption.toFixed(1)} L/100</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Modelo 576 España</td>
                ${details.map(d => `<td>${d.calc.mod576.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">ITP España</td>
                ${details.map(d => `<td>${d.calc.itp.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Total Impuestos</td>
                ${details.map(d => `<td class="${d.calc.totalTaxes === minTaxes ? 'matrix-winner-val' : ''}">${d.calc.totalTaxes.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Ruta Viaje Logística</td>
                ${details.map(d => `<td>${d.calc.routeCost.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`).join('')}
            </tr>
            <tr>
                <td class="matrix-row-title">Adicionales Import.</td>
                ${details.map(d => `<td>${d.calc.totalImportation.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`).join('')}
            </tr>
            <tr style="background: rgba(99, 102, 241, 0.04);">
                <td class="matrix-row-title" style="font-weight: 700; color: #a5b4fc;">Total Proyecto</td>
                ${details.map(d => {
                    const combined = d.car.price + d.calc.totalImportation;
                    return `<td class="${combined === minCombinedCost ? 'matrix-winner-val' : ''}" style="font-weight: 800; ${combined === minCombinedCost ? 'color: var(--color-success);' : 'color: #fff;'}">${combined.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €</td>`;
                }).join('')}
            </tr>
        `;
        
        table.querySelector('thead').innerHTML = headHTML;
        table.querySelector('tbody').innerHTML = bodyHTML;

        // Bind Activar button clicks inside Matrix table
        table.querySelectorAll('.btn-activate-matrix').forEach(btn => {
            btn.addEventListener('click', () => {
                const carId = btn.getAttribute('data-id');
                const selectedCar = checkedCars.find(c => c.id === carId);
                if (selectedCar) {
                    state.loadedCarId = carId;
                    // Populate global state specs
                    state.price = selectedCar.price;
                    state.co2 = selectedCar.co2;
                    state.power = selectedCar.power;
                    state.consumption = selectedCar.consumption;
                    state.km = selectedCar.km;
                    
                    // Estimate age based on year
                    const currentYear = new Date().getFullYear();
                    const ageYears = Math.max(1, currentYear - selectedCar.year);
                    state.ageMonths = ageYears * 12;
                    
                    // Update state variables & sync UI
                    updateCalculatorUI();
                    
                    // Close the Comparison Modal
                    comparisonModal.style.display = 'none';
                    
                    // Transition to the Calculator tab
                    switchTab('page-calculator');
                    
                    // Language-sensitive alerts
                    const isEn = state.language === 'en';
                    const isDe = state.language === 'de';
                    const alertMsg = isEn 
                        ? `Car loaded into the Calculator! Specifications of ${selectedCar.brand} ${selectedCar.model} applied successfully.`
                        : isDe
                        ? `Auto in den Rechner geladen! Technische Daten von ${selectedCar.brand} ${selectedCar.model} erfolgreich übernommen.`
                        : `¡Coche cargado en la Calculadora! Las especificaciones de ${selectedCar.brand} ${selectedCar.model} se han aplicado con éxito.`;
                    
                    alert(alertMsg);
                }
            });
        });
    };

    // IA Comparison trigger
    const btnCompareTrigger = document.getElementById('btn-trigger-comparison');
    if (btnCompareTrigger) {
        btnCompareTrigger.addEventListener('click', () => {
            comparisonModal.style.display = 'flex';
            renderComparisonMatrix();
            triggerGeminiAIAnalysis();
        });
    }

    // Google Gemini AI API Chat Fetch & Fallback script
    let chatHistory = [];
    
    const triggerGeminiAIAnalysis = async () => {
        const messagesBox = document.getElementById('ai-messages-box');
        if (!messagesBox) return;
        
        const checkedCars = state.selectedCars.filter(c => c.selected);
        const carSummary = checkedCars.map(c => `- ${c.brand} ${c.model} (${c.year}): ${c.price}€, ${c.km}km, ${c.co2}g CO2, ${c.power}CV, ${c.consumption}L/100km`).join('\n');
        
        // Reset chat history
        chatHistory = [];
        
        // Render loading state
        messagesBox.innerHTML = `
            <div class="ai-msg received">
                <p>¡Hola! Soy tu asistente de IA especializado de <strong>Manza AutoGerma Import</strong>.</p>
            </div>
            <div class="ai-msg received loading-chat" id="chat-loading-bubble">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        `;
        messagesBox.scrollTop = messagesBox.scrollHeight;
        
        const initialPrompt = `Analiza los siguientes coches seleccionados por el comprador español en Alemania y realiza una comparativa crítica técnica y de impuestos de importación (Modelo 576, ITP): \n${carSummary}\n
        Sugerencias breves en formato markdown en español. Termina con sugerencias de negociación.`;

        // Wait 1 second to show premium animation
        setTimeout(async () => {
            await executeGeminiRequest(initialPrompt);
            renderAlternativeWebsites(checkedCars);
        }, 1200);
    };

    const executeGeminiRequest = async (promptText) => {
        const messagesBox = document.getElementById('ai-messages-box');
        const loadingBubble = document.getElementById('chat-loading-bubble');
        
        // Active key check
        if (state.geminiApiKey && state.geminiApiKey !== '') {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptText }] }],
                        generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
                    })
                });
                
                if (!response.ok) throw new Error('API Error response');
                
                const data = await response.json();
                const aiText = data.candidates[0].content.parts[0].text;
                
                if (loadingBubble) loadingBubble.remove();
                addChatBubble(aiText, 'received');
                
            } catch (err) {
                console.warn('Gemini Real API Call failed, triggering Smart Fallback engine.', err);
                runAnalyticalLocalFallback(promptText);
            }
        } else {
            // Local Fallback active
            runAnalyticalLocalFallback(promptText);
        }
    };

    const addChatBubble = (text, type) => {
        const box = document.getElementById('ai-messages-box');
        if (!box) return;
        
        const bubble = document.createElement('div');
        bubble.className = `ai-msg ${type}`;
        
        // Simple Markdown formatter for bold and lists to look extremely professional
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n- (.*?)/g, '<br>• $1')
            .replace(/\n\d+\.\s(.*?)/g, '<br><strong>$1</strong>')
            .replace(/\n/g, '<br>');
            
        bubble.innerHTML = `<p>${formattedText}</p>`;
        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight;
    };

    // ADVANCED LOCAL FALLBACK ENGINE (TAILORED AND HIGHLY ANALYTICAL)
    const runAnalyticalLocalFallback = (promptText) => {
        const loadingBubble = document.getElementById('chat-loading-bubble');
        if (loadingBubble) loadingBubble.remove();
        
        const checkedCars = state.selectedCars.filter(c => c.selected);
        if (checkedCars.length < 2) return;
        
        // Custom answers depending on what prompt is received
        let response = '';
        
        if (promptText.includes('menos impuestos')) {
            response = `### ⚖️ Análisis del Impacto Fiscal en España\n\n`;
            checkedCars.forEach(c => {
                const taxes = calculateTaxesForCar(c);
                const bracket = c.co2 <= 120 ? 'Exento (0%)' : c.co2 <= 159 ? 'Bajo (4.75%)' : c.co2 <= 199 ? 'Medio (9.75%)' : 'Alto (14.75%)';
                response += `* **${c.brand} ${c.model}**: CO2 es **${c.co2} g/km**, tramo de matriculación **${bracket}**. Sus impuestos totales son **${taxes.totalTaxes.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €** (Modelo 576: ${taxes.mod576.toLocaleString('es-ES', { maximumFractionDigits: 2 })} € | ITP: ${taxes.itp.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €).\n`;
            });
            const winner = checkedCars.reduce((prev, curr) => prev.co2 < curr.co2 ? prev : curr);
            response += `\n**🏆 Coche más eficiente fiscalmente**: El **${winner.brand} ${winner.model}** debido a sus emisiones bajas de CO₂. ¡Te ahorrarás una cantidad significativa en la matriculación en España!`;
            
        } else if (promptText.includes('vendedor alemán')) {
            response = `### 🗣️ Preguntas Clave de Negociación para el Vendedor Alemán\n\n`;
            response += `1. **¿El precio anunciado incluye el 19% de MwSt (IVA alemán) deducible?** (Relevante para empresas o si compras como particular y el coche tiene < 6 meses o < 6.000 km).\n`;
            response += `2. **¿Tiene el coche el Certificado de Conformidad Europeo (COC)?** (Indispensable para evitar homologaciones individuales costosas en la ITV de España).\n`;
            response += `3. **¿Dispone de historial de mantenimiento completo ("Scheckheftgepflegt")?** (Solicita copia digital de las revisiones en concesionario oficial).\n`;
            response += `4. **¿Se ha realizado el HU/AU (TÜV) recientemente?** (Garantiza que el estado mecánico pasa las pruebas de seguridad de Alemania y facilitará la inspección ITV de importación en España).\n`;
            response += `5. **¿El vehículo tiene algún daño previo de accidente ("Unfallfrei")?** (Exige que conste explícitamente en el contrato de compraventa Kaufvertrag).`;
            
        } else if (promptText.includes('ruta de conducción') || promptText.includes('consumos')) {
            response = `### 🚗 Comparación de Itinerario de Viaje (2.100 km)\n\n`;
            checkedCars.forEach(c => {
                const fuelCost = ((2100 * c.consumption) / 100) * state.fuelPrice;
                const totalCost = 120.00 + 95.00 + 250.00 + fuelCost + (state.hotelNights * 85.00);
                response += `* **${c.brand} ${c.model}**: Con un consumo de **${c.consumption.toFixed(1)} L/100km**, el gasto de combustible en ruta será de **${fuelCost.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €**. Sumando vuelo, peajes y placas exportación, el coste total de viaje es de **${totalCost.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €**.\n`;
            });
            const winner = checkedCars.reduce((prev, curr) => prev.consumption < curr.consumption ? prev : curr);
            response += `\n**💡 Recomendación**: El **${winner.brand} ${winner.model}** es el más económico para hacer el viaje de vuelta conduciendo por carretera, consumiendo menos combustible.`;
            
        } else if (promptText.includes('pros y contras')) {
            response = `### 🔍 Pros & Contras y Fiabilidad de los Modelos Seleccionados\n\n`;
            checkedCars.forEach(c => {
                response += `* **${c.brand} ${c.model} (${c.year})**:\n`;
                if (c.brand === 'Audi') {
                    response += `  * **Pros**: Excelente habitabilidad, tacto de conducción confortable, interior silencioso e inyección refinada.\n  * **Contras**: Posible desgaste prematuro del tensor de la cadena en unidades descuidadas, coste de mantenimiento de la caja de cambios S-Tronic.\n`;
                } else if (c.brand === 'BMW') {
                    response += `  * **Pros**: Dinámica de conducción ágil, motor bi-turbo elástico, caja de cambios automática ZF de 8 velocidades súper fiable.\n  * **Contras**: Dirección a veces demasiado rígida en ciudad, suspensión firme si lleva equipamiento M-Sport.\n`;
                } else if (c.brand === 'Mercedes-Benz') {
                    response += `  * **Pros**: Confort absoluto de marcha, sistemas de asistencia de vanguardia, gran durabilidad mecánica en motores diésel OM654.\n  * **Contras**: Precio de recambios premium en concesionario oficial, interfaz de pantalla MBUX compleja.\n`;
                } else {
                    response += `  * **Pros**: Consumos extremadamente frugales, recambios muy baratos, gran valor de reventa en el mercado de ocasión español.\n  * **Contras**: Menor aislamiento acústico en autopista, acabados interiores más sencillos en comparación con el trío premium.\n`;
                }
            });
            
        } else {
            // General Comparison response
            response = `### 📊 Comparativa General Técnica de Coches Seleccionados\n\n`;
            checkedCars.forEach(c => {
                const taxes = calculateTaxesForCar(c);
                response += `* **${c.brand} ${c.model}**: Con **${c.power} CV** y emisiones de **${c.co2} g/km**, el coche cuesta **${c.price.toLocaleString('es-ES')} €** con **${c.km.toLocaleString('es-ES')} km** acumulados. Su coste total de importación estimado es de **${taxes.totalImportation.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €**.\n`;
            });
            const winner = checkedCars.reduce((prev, curr) => prev.price < curr.price ? prev : curr);
            response += `\n**👉 Diagnóstico**: Si tu prioridad es el coste inicial, el **${winner.brand} ${winner.model}** representa la opción de compra más competitiva. No obstante, te sugerimos que consultes las preguntas clave para negociar y valides el estado del vehículo mediante NeedCarHelp.`;
        }
        
        addChatBubble(response, 'received');
    };

    // SUGGESTED PORTALS CHIPS IN COMPARISON MODAL (DYNAMICS WEBSITES)
    const renderAlternativeWebsites = (checkedCars) => {
        const box = document.getElementById('suggested-websites-box');
        if (!box) return;
        
        box.innerHTML = ''; // clear
        
        const firstCar = checkedCars[0] || { brand: 'Audi', model: 'A3' };
        const secondCar = checkedCars[1] || { brand: 'BMW', model: '320d' };
        
        // Mock portals
        const portals = [
            {
                name: 'AutoGott.de (Búsqueda recomendada)',
                desc: `Encuentra ofertas con descuento de concesionarios oficiales para un ${firstCar.brand}.`,
                brand: firstCar.brand,
                model: firstCar.model,
                price: Math.round(firstCar.price * 0.95),
                co2: firstCar.co2,
                power: firstCar.power,
                consumption: firstCar.consumption,
                km: Math.round(firstCar.km * 0.85)
            },
            {
                name: 'Auto-Park Rath (Concesionario Oficial)',
                desc: `Unidad garantizada "Junge Sterne" del ${secondCar.brand} con historial certificado.`,
                brand: secondCar.brand,
                model: secondCar.model,
                price: Math.round(secondCar.price * 0.98),
                co2: secondCar.co2,
                power: secondCar.power,
                consumption: secondCar.consumption,
                km: Math.round(secondCar.km * 0.9)
            }
        ];
        
        portals.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = 'suggested-portal-item';
            item.innerHTML = `
                <div>
                    <h4>${p.name}</h4>
                    <p>${p.desc}</p>
                </div>
                <button class="suggested-portal-btn" id="btn-add-portal-${idx}">+ Añadir opción al panel (€${p.price.toLocaleString('es-ES')})</button>
            `;
            
            box.appendChild(item);
            
            // Add suggested portal car dynamically to selection panel!
            item.querySelector('.suggested-portal-btn').addEventListener('click', () => {
                if (state.selectedCars.length >= 4) {
                    alert('El panel ya tiene el límite de 4 coches.');
                    return;
                }
                
                const newCar = {
                    id: 'suggested-' + idx + '-' + Date.now(),
                    brand: p.brand,
                    model: p.model + ' (Sugerido por IA)',
                    year: 2021,
                    price: p.price,
                    km: p.km,
                    co2: p.co2,
                    power: p.power,
                    consumption: p.consumption,
                    photo: idx === 0 ? 'sedan' : 'suv',
                    selected: true
                };
                
                state.selectedCars.push(newCar);
                renderCarList();
                comparisonModal.style.display = 'none';
                alert(`¡Coche sugerido por la IA de "${p.name}" añadido con éxito al panel de comparación!`);
            });
        });
    };

    // Chat custom input binding
    const chatInput = document.getElementById('ai-chat-input');
    const btnSendMsg = document.getElementById('btn-ai-send-msg');
    
    if (btnSendMsg && chatInput) {
        const sendMessage = () => {
            const val = chatInput.value.trim();
            if (val === '') return;
            
            addChatBubble(val, 'sent');
            chatInput.value = '';
            
            const messagesBox = document.getElementById('ai-messages-box');
            // Add loading dot
            const bubble = document.createElement('div');
            bubble.className = 'ai-msg received loading-chat';
            bubble.id = 'chat-loading-bubble-custom';
            bubble.innerHTML = '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>';
            messagesBox.appendChild(bubble);
            messagesBox.scrollTop = messagesBox.scrollHeight;
            
            setTimeout(() => {
                const customBubble = document.getElementById('chat-loading-bubble-custom');
                if (customBubble) customBubble.remove();
                executeGeminiRequest(val);
            }, 1000);
        };
        
        btnSendMsg.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Chip click bindings
    document.querySelectorAll('.ai-chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-query');
            addChatBubble(query, 'sent');
            
            const messagesBox = document.getElementById('ai-messages-box');
            const bubble = document.createElement('div');
            bubble.className = 'ai-msg received loading-chat';
            bubble.id = 'chat-loading-bubble-custom';
            bubble.innerHTML = '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>';
            messagesBox.appendChild(bubble);
            messagesBox.scrollTop = messagesBox.scrollHeight;
            
            setTimeout(() => {
                const customBubble = document.getElementById('chat-loading-bubble-custom');
                if (customBubble) customBubble.remove();
                executeGeminiRequest(query);
            }, 1000);
        });
    });

    // Populate empty presets on start so panel shows beautiful initial loading
    state.selectedCars = JSON.parse(JSON.stringify(presetCars));
    renderCarList();


    // ==========================================================================
    // 4. TAX & LOGISTICS CALCULATOR SYSTEM (SPANISH CALCULATOR ENGINE)
    // ==========================================================================
    
    // DOM Elements Mapping
    const sliderPrice = document.getElementById('calc-price');
    const sliderCO2 = document.getElementById('calc-co2');
    const sliderPower = document.getElementById('calc-power');
    const selectProvince = document.getElementById('calc-province');
    const checkInvoice = document.getElementById('calc-seller-invoice');
    const checkLuxury = document.getElementById('calc-luxury');
    const checkDamaged = document.getElementById('calc-damaged');
    const checkFamily = document.getElementById('calc-large-family');
    const inputAge = document.getElementById('calc-age');
    const inputKM = document.getElementById('calc-km');

    // Values indicators labels
    const valPrice = document.getElementById('val-price');
    const valCO2 = document.getElementById('val-co2');
    const valPower = document.getElementById('val-power');
    const co2BracketInfo = document.getElementById('co2-bracket-info');

    // Cost dynamic inputs on change event listeners
    const calculatorInputs = [
        sliderPrice, sliderCO2, sliderPower, selectProvince, 
        checkInvoice, checkLuxury, checkDamaged, checkFamily,
        inputAge, inputKM
    ];

    calculatorInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                state.loadedCarId = null;
                renderCalculatorSuggestions();
                readCalculatorInputs();
                runTaxCalculations();
            });
            input.addEventListener('change', () => {
                state.loadedCarId = null;
                renderCalculatorSuggestions();
                readCalculatorInputs();
                runTaxCalculations();
            });
        }
    });

    const readCalculatorInputs = () => {
        state.price = parseInt(sliderPrice.value);
        state.co2 = parseInt(sliderCO2.value);
        state.power = parseInt(sliderPower.value);
        state.province = selectProvince.value;
        state.sellerInvoice = checkInvoice.checked;
        state.luxury = checkLuxury.checked;
        state.damaged = checkDamaged.checked;
        state.largeFamily = checkFamily.checked;
        state.ageMonths = parseInt(inputAge.value) || 12;
        state.km = parseInt(inputKM.value) || 10000;

        // Sync Labels
        valPrice.textContent = `${state.price.toLocaleString('es-ES')} €`;
        valCO2.textContent = `${state.co2} g/km`;
        valPower.textContent = `${state.power} CV`;
    };

    // CORE TAX ENGINE
    const runTaxCalculations = () => {
        // A. Depreciation adjustment for taxable base
        const depreciationRatio = getDepreciationRatio(state.ageMonths);
        let depreciatedBase = state.price * depreciationRatio;

        // Apply damaged car reduction if marked
        if (state.damaged) {
            depreciatedBase = depreciatedBase * 0.75; // 25% discount for major damage
        }

        // B. Modelo 576 Registration Tax Brackets
        let taxRate = 0;
        let bracketText = 'Tramo 0g-120g: Exento (0%)';
        
        if (state.co2 > 120 && state.co2 <= 159) {
            taxRate = 0.0475;
            bracketText = 'Tramo 121g-159g: Bajo (4,75%)';
        } else if (state.co2 >= 160 && state.co2 <= 199) {
            taxRate = 0.0975;
            bracketText = 'Tramo 160g-199g: Medio (9,75%)';
        } else if (state.co2 >= 200) {
            taxRate = 0.1475;
            bracketText = 'Tramo >=200g: Alto (14,75%)';
        }
        co2BracketInfo.textContent = bracketText;

        // Calculate primary registration tax
        let registrationTax = depreciatedBase * taxRate;

        // Apply luxury premium if marked
        if (state.luxury) {
            registrationTax += (state.price * 0.03); // Extra 3% visual premium
        }

        // Large Family 50% discount
        if (state.largeFamily) {
            registrationTax = registrationTax * 0.5;
        }

        // C. ITP (Transfer Tax) - Applies ONLY if bought from a private seller (No invoice)
        let transferTax = 0;
        const rowITP = document.getElementById('row-itp');
        
        if (!state.sellerInvoice) {
            const itpRate = provinceITPRates[state.province] || 0.04;
            transferTax = depreciatedBase * itpRate;
            
            // Show ITP breakdown row in results card
            if (rowITP) {
                rowITP.style.display = 'flex';
                document.getElementById('calc-itp-percent').textContent = `${provinceLabels[state.province]}`;
                document.getElementById('res-tax-itp').textContent = `${transferTax.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
            }
        } else {
            if (rowITP) rowITP.style.display = 'none';
        }

        // D. Administrative Fees
        const itvCost = 150.00; // Fixed approx ITV fee
        
        // DGT fee (white plate) + provisional green plate fees + physical plates
        const trafficFees = 99.80 + 20.20 + 32.50; // Total: 152.50 €
        
        // ImportarCoches platform fee
        const managementCost = 250.00 * 1.21; // 250€ + 21% IVA = 302.50 €

        // E. Logistics driving cost calculation (synchronized)
        let logisticsCost = 950.00; // Carrier container standard estimate
        if (state.logisticsType === 'drive') {
            const flight = 120.00;
            const tolls = 95.00;
            const tempPlatesInsurance = 250.00;
            const travelFuel = ((2100 * state.consumption) / 100) * state.fuelPrice;
            const travelLodging = state.hotelNights * 85.00;
            
            logisticsCost = flight + tolls + tempPlatesInsurance + travelFuel + travelLodging;
            document.getElementById('res-logistics-type').textContent = 'Conduciendo desde Alemania';
        } else {
            document.getElementById('res-logistics-type').textContent = 'Transportista Portacoches';
        }

        // F. TOTAL CALCULATION (Grand Total: Car Price + Importation)
        const totalImportCost = state.price + registrationTax + transferTax + itvCost + trafficFees + managementCost + logisticsCost;

        // Update Calculator Card UI elements
        const resCarPriceEl = document.getElementById('res-car-price');
        if (resCarPriceEl) {
            resCarPriceEl.textContent = `${state.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        }
        
        document.getElementById('calc-bracket-percent').textContent = `Tramo ${bracketText.includes('4,75%') ? '4.75%' : bracketText.includes('9,75%') ? '9.75%' : bracketText.includes('14,75%') ? '14.75%' : '0%'}`;
        document.getElementById('res-tax-matriculacion').textContent = `${registrationTax.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        document.getElementById('res-logistics-cost').textContent = `${logisticsCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        document.getElementById('calc-total-import-cost').textContent = `${totalImportCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

        // Update active variables in global state so dashboard can read them
        state.computedTaxes = registrationTax + transferTax;
        state.computedLogistics = logisticsCost;
        state.computedAdmin = itvCost + trafficFees + managementCost;
        state.computedTotal = totalImportCost;
        updateCostBreakdownUI();

        // IVA Warnings validation banner
        const ivaAlert = document.getElementById('iva-alert');
        if (ivaAlert) {
            if (state.ageMonths < 6 || state.km < 6000) {
                ivaAlert.style.display = 'flex';
            } else {
                ivaAlert.style.display = 'none';
            }
        }
    };

    const updateCalculatorUI = () => {
        // Sync HTML Form fields with internal JS state
        sliderPrice.value = state.price;
        sliderCO2.value = state.co2;
        sliderPower.value = state.power;
        selectProvince.value = state.province;
        checkInvoice.checked = state.sellerInvoice;
        checkLuxury.checked = state.luxury;
        checkDamaged.checked = state.damaged;
        checkFamily.checked = state.largeFamily;
        inputAge.value = state.ageMonths;
        inputKM.value = state.km;
        
        readCalculatorInputs();
        runTaxCalculations();
        renderCalculatorSuggestions();
    };

    // Calculate budget application
    const saveBudgetBtn = document.getElementById('btn-save-calc-budget');
    if (saveBudgetBtn) {
        saveBudgetBtn.addEventListener('click', () => {
            // Apply budget to dashboard
            document.getElementById('dash-budget-total').textContent = `${state.computedTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
            document.getElementById('dash-budget-car-price').textContent = `Precio coche no incluido: ${state.price.toLocaleString('es-ES')} €`;
            document.getElementById('dash-budget-taxes').textContent = `${state.computedTaxes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
            document.getElementById('dash-budget-logistics').textContent = `${state.computedLogistics.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
            document.getElementById('dash-budget-admin').textContent = `${state.computedAdmin.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
            
            // Mark step 2 "Trámites en Alemania" as completed upon saving calculator plan
            state.checklist['ger-4'] = true;
            const chkGer4 = document.getElementById('chk-ger-4');
            if (chkGer4) chkGer4.checked = true;
            updateProgress();

            alert('Presupuesto aplicado con éxito al panel de control de tu importación.');
            switchTab('page-dashboard');
        });
    }

    // Render dynamic suggested vehicles row in the calculator
    const renderCalculatorSuggestions = () => {
        const section = document.getElementById('calculator-suggestions-section');
        const list = document.getElementById('calc-suggestions-list');
        
        if (!section || !list) return;
        
        // Filter checked/selected vehicles from Búsqueda panel
        const checkedCars = state.selectedCars.filter(c => c.selected);
        
        if (checkedCars.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        list.innerHTML = ''; // Clear prior cards
        
        const lang = state.language || 'es';
        const dict = translations[lang] || translations['es'];
        
        checkedCars.forEach(car => {
            const taxes = calculateTaxesForCar(car);
            const totalProject = car.price + taxes.totalImportation;
            const isLoaded = state.loadedCarId === car.id;
            
            const card = document.createElement('div');
            card.className = `calc-suggest-card ${isLoaded ? 'active-loaded' : ''}`;
            card.setAttribute('data-id', car.id);
            
            card.innerHTML = `
                <div class="calc-suggest-info">
                    <h5>${car.brand} ${car.model}</h5>
                    <p>${car.year} • ${car.power} CV</p>
                </div>
                <div class="calc-suggest-cost-row">
                    <div class="item-cost">
                        <span>Coche:</span>
                        <strong>${car.price.toLocaleString('es-ES')} €</strong>
                    </div>
                    <div class="item-cost">
                        <span>${dict.calc_suggest_import || 'Coste Import.'}:</span>
                        <strong>${taxes.totalImportation.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</strong>
                    </div>
                    <div class="item-cost cost-bold">
                        <span>${dict.calc_suggest_total || 'Total Proyecto'}:</span>
                        <strong>${totalProject.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</strong>
                    </div>
                </div>
                <button class="btn-calc-suggest-load">
                    ${isLoaded ? (dict.calc_suggest_btn_loaded || 'Cargado') : (dict.calc_suggest_btn_load || 'Cargar')}
                </button>
            `;
            
            // Clicking card triggers selection!
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                
                state.loadedCarId = car.id;
                
                // Populate global state specs
                state.price = car.price;
                state.co2 = car.co2;
                state.power = car.power;
                state.consumption = car.consumption;
                state.km = car.km;
                
                // Estimate age based on year
                const currentYear = new Date().getFullYear();
                const ageYears = Math.max(1, currentYear - car.year);
                state.ageMonths = ageYears * 12;
                
                // Update state variables & sync UI
                updateCalculatorUI();
                
                // Re-render suggestions to reflect active-loaded state
                renderCalculatorSuggestions();
            });
            
            list.appendChild(card);
        });
    };


    // ==========================================================================
    // 5. TRAVEL & ACCOMMODATION / HOTEL SEARCH ACTIONS
    // ==========================================================================
    
    // Choose driving vs carrier
    const btnTabDrive = document.getElementById('tab-log-drive');
    const btnTabCarrier = document.getElementById('tab-log-carrier');
    const panelDrive = document.getElementById('drive-home-panel');
    const panelCarrier = document.getElementById('carrier-panel');

    const toggleLogisticsType = (type) => {
        state.logisticsType = type;
        if (type === 'drive') {
            btnTabDrive.classList.add('active');
            btnTabCarrier.classList.remove('active');
            panelDrive.classList.add('active');
            panelCarrier.classList.remove('active');
        } else {
            btnTabDrive.classList.remove('active');
            btnTabCarrier.classList.add('active');
            panelDrive.classList.remove('active');
            panelCarrier.classList.add('active');
        }
        updateTravelUI();
        runTaxCalculations();
    };

    if (btnTabDrive) btnTabDrive.addEventListener('click', () => toggleLogisticsType('drive'));
    if (btnTabCarrier) btnTabCarrier.addEventListener('click', () => toggleLogisticsType('carrier'));

    // Travel Slider Listeners
    const sliderConsumption = document.getElementById('travel-consumption');
    const valConsumption = document.getElementById('val-consumption');
    const inputFuelPrice = document.getElementById('travel-fuel-price');
    const inputPassengers = document.getElementById('travel-passengers');
    const sliderHotelNights = document.getElementById('hotel-nights');
    const valHotelNights = document.getElementById('val-hotel-nights');
    const labelEstimatedLodging = document.getElementById('hotel-estimated-lodging');

    const updateTravelUI = () => {
        if (state.logisticsType !== 'drive') return;
        
        state.consumption = parseFloat(sliderConsumption.value);
        state.fuelPrice = parseFloat(inputFuelPrice.value) || 1.72;
        state.passengers = parseInt(inputPassengers.value) || 1;
        state.hotelNights = parseInt(sliderHotelNights.value) || 2;
        state.hotelSearchCity = document.getElementById('hotel-search-city').value;

        // Label Sync
        valConsumption.textContent = `${state.consumption.toFixed(1)} L`;
        valHotelNights.textContent = `${state.hotelNights} Noche${state.hotelNights > 1 ? 's' : ''}`;
        
        // Calculate items
        const fuelCost = ((2100 * state.consumption) / 100) * state.fuelPrice;
        const hotelCost = state.hotelNights * 85.00;
        const flightCost = 120.00;
        const tollsCost = 95.00;
        const exportPlatesCost = 250.00;
        const totalViaje = fuelCost + hotelCost + flightCost + tollsCost + exportPlatesCost;

        // Update Itinerary Breakdown UI card
        labelEstimatedLodging.textContent = `Coste de estancia estimado: ${hotelCost.toFixed(2)} € (85€ / noche)`;
        document.getElementById('item-log-fuel').textContent = `${fuelCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        document.getElementById('item-log-hotel').textContent = `${hotelCost.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        document.getElementById('item-log-total').textContent = `${totalViaje.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    };

    const travelSliders = [sliderConsumption, inputFuelPrice, inputPassengers, sliderHotelNights];
    travelSliders.forEach(slider => {
        if (slider) {
            slider.addEventListener('input', updateTravelUI);
            slider.addEventListener('change', updateTravelUI);
        }
    });

    // ==========================================================================
    // 5B. TRAVEL AI ITINERARY PLANNER ENGINE (GOOGLE GEMINI / EXPERT FALLBACK)
    // ==========================================================================
    const getLocalTravelPlan = (origin, destination, car, nights, fuelPrice, lang) => {
        const carName = car ? `${car.brand} ${car.model}` : "Vehículo";
        const cons = car ? car.consumption : 6.5;
        const distanceKm = 2100;
        const fuelCost = ((distanceKm * cons) / 100) * fuelPrice;
        
        const originLower = origin.toLowerCase();
        let airportCode = "MUC";
        let airportName = "Múnich (Franz Josef Strauss)";
        let regionName = "Baviera";
        if (originLower.includes("stuttgart") || originLower.includes("sindelfingen") || originLower.includes("karlsruhe")) {
            airportCode = "STR";
            airportName = "Stuttgart (Echterdingen)";
            regionName = "Baden-Württemberg";
        } else if (originLower.includes("berlin") || originLower.includes("potsdam") || originLower.includes("dresden")) {
            airportCode = "BER";
            airportName = "Berlín-Brandenburgo";
            regionName = "Berlín";
        } else if (originLower.includes("wolfsburg") || originLower.includes("hannover") || originLower.includes("hamburg") || originLower.includes("bremen")) {
            airportCode = "HAJ/FRA";
            airportName = "Hannover (HAJ) o Frankfurt (FRA)";
            regionName = "Norte/Sajonia";
        }
        
        let stops = [];
        if (nights === 1) {
            stops = [
                { city: "Lyon", desc_es: "Excelente punto intermedio en Francia para descansar tras 8-9 horas de conducción.", desc_en: "Excellent midpoint in France to rest after 8-9 hours of driving.", desc_de: "Hervorragender Zwischenstopp in Frankreich zum Ausruhen nach 8-9 Stunden Fahrt." }
            ];
        } else if (nights === 2) {
            stops = [
                { city: "Lyon", desc_es: "Parada tras la primera jornada cruzando el sur de Alemania y el centro de Francia.", desc_en: "Stop after the first day crossing southern Germany and central France.", desc_de: "Stopp nach dem ersten Tag der Überquerung Süddeutschlands und Zentralfrankreichs." },
                { city: "Bordeaux", desc_es: "Ideal para descansar antes de afrontar la frontera española al día siguiente.", desc_en: "Ideal to rest before crossing the Spanish border the next day.", desc_de: "Ideal zum Ausruhen, bevor Sie am nächsten Tag die spanische Grenze überqueren." }
            ];
        } else if (nights === 3) {
            stops = [
                { city: "Stuttgart", desc_es: "Ideal para inspeccionar el coche y descansar la primera noche antes del viaje principal.", desc_en: "Ideal to inspect the car and rest the first night before the main trip.", desc_de: "Ideal, um das Auto zu inspizieren und die erste Nacht vor der Hauptreise auszuruhen." },
                { city: "Lyon", desc_es: "Perfecto alto en el camino tras cruzar la frontera franco-alemana.", desc_en: "Perfect stop along the way after crossing the French-German border.", desc_de: "Perfekter Zwischenstopp nach der französisch-deutschen Grenze." },
                { city: "Bordeaux", desc_es: "Gran ciudad francesa para recargar energías antes del tramo final.", desc_en: "Great French city to recharge before the final leg of the trip.", desc_de: "Tolle französische Stadt zum Auftanken vor der letzten Etappe." }
            ];
        } else {
            stops = [
                { city: "Stuttgart", desc_es: "Primera parada para asegurar papeleo sin prisa en la Zulassungsstelle.", desc_en: "First stop to secure paperwork without rushing at the Zulassungsstelle.", desc_de: "Erster Stopp, um den Papierkram ohne Eile bei der Zulassungsstelle zu erledigen." },
                { city: "Clermont-Ferrand", desc_es: "Parada escénica y tranquila en la región de Auvernia en Francia.", desc_en: "Scenic and quiet stop in the Auvergne region of France.", desc_de: "Malerischer und ruhiger Zwischenstopp in der Region Auvergne in Frankreich." },
                { city: "Bordeaux", desc_es: "Descanso estratégico antes de entrar al norte de España por Irún.", desc_en: "Strategic rest before entering northern Spain via Irun.", desc_de: "Strategische Pause vor der Einreise nach Nordspanien über Irun." },
                { city: "San Sebastián", desc_es: "Primera parada gastronómica en España para celebrar tu nueva adquisición.", desc_en: "First gastronomic stop in Spain to celebrate your new acquisition.", desc_de: "Erster gastronomischer Stopp in Spanien, um Ihren Neuzugang zu feiern." }
            ];
        }

        if (lang === 'en') {
            let stopText = stops.map(s => `- **${s.city}**: ${s.desc_en} [Book Hotel in ${s.city}](https://www.booking.com/searchresults.html?ss=${s.city})`).join('\n');
            return `### Phase 1: Departure Flight (${airportCode})
- Fly from Spain to **${airportName} Airport (${airportCode})**, which is the closest airport to the pickup location in **${regionName}**.
- Search for flight options on [Skyscanner](https://www.skyscanner.es/). Make sure to book early!

### Phase 2: German Export Paperwork
- Visit the local traffic office (**Zulassungsstelle**) to register the vehicle for export.
- You **MUST** purchase **Red Export Plates (Ausfuhrkennzeichen)** which include temporary third-party liability insurance.
- **WARNING**: Do **NOT** buy yellow plates (Kurzzeitkennzeichen), as they are illegal for driving through France to Spain and French police may fine you up to €375 and impound the car.

### Phase 3: Road Trip Route
- Total driving distance is approximately **${distanceKm} km** from ${origin} to ${destination}.
- Fuel forecast: **${fuelCost.toFixed(2)} €** based on average consumption of **${cons.toFixed(1)} L/100km** (using active car metrics).
- Route highlights: Drive through the German Autobahn (maintain recommended speed of **130 km/h** for fuel efficiency), enter France via Mulhouse/Besançon, pay French tolls (A6/A7/A9/A63, approx. **95 €** total), and enter Spain via Irún (AP-8).

### Phase 4: Recommended Lodgings (${nights} night${nights > 1 ? 's' : ''})
- Based on your slider, we suggest these intermediate rest stops:
${stopText}`;
        } else if (lang === 'de') {
            let stopText = stops.map(s => `- **${s.city}**: ${s.desc_de} [Hotel in ${s.city} buchen](https://www.booking.com/searchresults.html?ss=${s.city})`).join('\n');
            return `### Phase 1: Hinflug (${airportCode})
- Fliegen Sie von Spanien zum Flughafen **${airportName} (${airportCode})**, der dem Abholort in **${regionName}** am nächsten liegt.
- Suchen Sie nach Flugverbindungen auf [Skyscanner](https://www.skyscanner.es/). Buchen Sie rechtzeitig!

### Phase 2: Deutsche Ausfuhrpapiere
- Suchen Sie die Zulassungsstelle auf, um das Fahrzeug für den Export anzumelden.
- Sie **MÜSSEN** ein **Ausfuhrkennzeichen (rote Schilder)** erwerben, das eine Haftpflichtversicherung und die grüne Versicherungskarte beinhaltet.
- **WARNUNG**: Kaufen Sie **KEINE** Kurzzeitkennzeichen (gelbe Schilder). Die Durchreise durch Frankreich nach Spanien mit gelben Schildern ist illegal und kann zu Geldstrafen der französischen Polizei von bis zu 375 € sowie zur Beschlagnahmung des Autos führen.

### Phase 3: Reiseroute mit dem Auto
- Die Gesamtfahrstrecke beträgt ca. **${distanceKm} km** von ${origin} nach ${destination}.
- Kraftstoffkosten: **${fuelCost.toFixed(2)} €** basierend auf einem Durchschnittsverbrauch von **${cons.toFixed(1)} L/100km**.
- Route: Fahrt über deutsche Autobahnen (Richtgeschwindigkeit von **130 km/h** für optimale Effizienz empfohlen), Einreise nach Frankreich über Mülhausen, Nutzung französischer Autobahnen (ca. **95 €** Mautgebühren) und Einreise nach Spanien über Irún (AP-8).

### Phase 4: Empfohlene Unterkünfte (${nights} Übernachtung${nights > 1 ? 'en' : ''})
- Entsprechend Ihrer Auswahl empfehlen wir folgende Zwischenstopps:
${stopText}`;
        } else {
            let stopText = stops.map(s => `- **${s.city}**: ${s.desc_es} [Buscar Hotel en ${s.city}](https://www.booking.com/searchresults.html?ss=${s.city})`).join('\n');
            return `### Fase 1: Vuelo de Ida (${airportCode})
- Vuela desde España hacia el **Aeropuerto de ${airportName} (${airportCode})**, la terminal recomendada para la recogida en la zona de **${regionName}**.
- Busca opciones de vuelos directos o con conexiones en [Skyscanner](https://www.skyscanner.es/). ¡Reserva con antelación!

### Fase 2: Trámites de Salida en Alemania
- Acude a la oficina de tráfico local (**Zulassungsstelle**) para tramitar la baja por exportación.
- Es obligatorio solicitar las **Matrículas de Exportación (Ausfuhrkennzeichen - placas rojas)** con banda roja lateral de caducidad, que incluyen seguro temporal y carta verde.
- **ADVERTENCIA CRÍTICA**: **NO** utilices matrículas temporales amarillas (Kurzzeitkennzeichen). Francia prohíbe su tránsito y la policía francesa impone multas de hasta 375 € y retención del vehículo.

### Fase 3: Ruta por Carretera
- Recorrido aproximado de **${distanceKm} km** cruzando Europa desde ${origin} hasta ${destination}.
- Previsión de carburante: **${fuelCost.toFixed(2)} €** calculados en base al consumo medio de tu vehículo de **${cons.toFixed(1)} L/100km** a un precio de carburante de **${fuelPrice.toFixed(2)} €/L**.
- Trazado: Autopistas alemanas (se aconseja velocidad recomendada de **130 km/h** en tramos sin límite por seguridad y ahorro), cruce por Francia vía Mulhouse, peajes franceses (aproximadamente **95 €** en autopistas francesas A6/A9/A63) y entrada a España por Irún (AP-8).

### Fase 4: Alojamientos Recomendados (${nights} Noche${nights > 1 ? 's' : ''})
- Según los días de viaje seleccionados en tu barra, te sugerimos realizar parada en:
${stopText}`;
        }
    };

    const parseMarkdownToTimeline = (text) => {
        const parts = text.split(/###\s*/);
        let html = '';
        let phaseIndex = 1;
        
        parts.forEach(part => {
            if (!part.trim()) return;
            
            const lines = part.split('\n');
            const titleLine = lines[0].trim();
            const contentLines = lines.slice(1).join('\n').trim();
            
            if (!titleLine) return;
            
            let formattedDetails = contentLines
                .replace(/\*\*(.*?)\*\"/g, '<strong>$1</strong>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n-\s(.*?)/g, '<br>• $1')
                .replace(/\n\*\s(.*?)/g, '<br>• $1')
                .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>')
                .replace(/\n/g, '<br>');
                
            let badgeText = '';
            if (state.language === 'en') {
                badgeText = `Phase ${phaseIndex}`;
            } else if (state.language === 'de') {
                badgeText = `Phase ${phaseIndex}`;
            } else {
                badgeText = `Fase ${phaseIndex}`;
            }
            
            html += `
                <div class="timeline-phase phase-${phaseIndex}">
                    <div class="timeline-marker"></div>
                    <div class="timeline-phase-title">
                        <h4>${titleLine}</h4>
                        <span class="badge-phase">${badgeText}</span>
                    </div>
                    <div class="timeline-details">
                        <p>${formattedDetails}</p>
                    </div>
                </div>
            `;
            phaseIndex++;
        });
        
        if (phaseIndex <= 1) {
            let formattedText = text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n- (.*?)/g, '<br>• $1')
                .replace(/\n/g, '<br>');
            html = `
                <div class="timeline-phase phase-1">
                    <div class="timeline-marker"></div>
                    <div class="timeline-phase-title">
                        <h4>Itinerario Planificado</h4>
                        <span class="badge-phase">Plan</span>
                    </div>
                    <div class="timeline-details">
                        <p>${formattedText}</p>
                    </div>
                </div>
            `;
        }
        
        return html;
    };

    const btnTriggerTravelAI = document.getElementById('btn-trigger-travel-ai');
    const spinnerTravelAI = document.getElementById('btn-travel-ai-spinner');
    const textTravelAI = document.getElementById('btn-travel-ai-text');
    const cardTravelAI = document.getElementById('travel-ai-plan-card');
    const timelineTravelAI = document.getElementById('travel-ai-timeline-content');
    const metaCarTravelAI = document.getElementById('travel-ai-meta-car');
    const metaRouteTravelAI = document.getElementById('travel-ai-meta-route');
    const btnCopyTravelPlan = document.getElementById('btn-copy-travel-plan');
    
    let generatedRawPlanText = '';

    if (btnTriggerTravelAI) {
        btnTriggerTravelAI.addEventListener('click', async () => {
            btnTriggerTravelAI.disabled = true;
            if (spinnerTravelAI) spinnerTravelAI.classList.remove('hidden');
            
            const dict = translations[state.language] || translations['es'];
            if (textTravelAI) textTravelAI.textContent = dict.travel_ai_loading || 'Generando plan...';
            
            const originCity = document.getElementById('travel-origin').value || 'Munich';
            const destCity = document.getElementById('travel-dest').value || 'Oviedo';
            
            const activeCar = state.selectedCars.find(c => c.id === state.activeCarId) || state.selectedCars[0] || null;
            const carLabel = activeCar ? `${activeCar.brand} ${activeCar.model}` : (state.language === 'en' ? 'Custom Vehicle' : state.language === 'de' ? 'Benutzerdefiniertes Fahrzeug' : 'Vehículo Personalizado');
            const carCons = activeCar ? activeCar.consumption : state.consumption;
            
            if (metaCarTravelAI) metaCarTravelAI.textContent = `${state.language === 'en' ? 'Vehicle' : state.language === 'de' ? 'Fahrzeug' : 'Vehículo'}: ${carLabel} (${carCons.toFixed(1)} L/100km)`;
            if (metaRouteTravelAI) metaRouteTravelAI.textContent = `${state.language === 'en' ? 'Route' : state.language === 'de' ? 'Route' : 'Ruta'}: ${originCity} → ${destCity}`;
            
            const promptText = `Eres un asesor experto de importación en Manza AutoGerma Import. Genera un itinerario detallado de recogida de vehículo paso a paso desde ${originCity} (Alemania) hasta ${destCity} (España).
Datos de contexto:
- Vehículo a recoger: ${carLabel} (Consumo medio: ${carCons.toFixed(1)} L/100km, combustible estimado a €${state.fuelPrice}/L).
- Pernoctaciones en ruta: ${state.hotelNights} noches de hotel seleccionadas.

El plan debe estar estructurado exactamente en 4 fases ordenadas, escritas en formato Markdown limpio y en el idioma de la consulta (${state.language === 'en' ? 'Inglés' : state.language === 'de' ? 'Alemán' : 'Español'}):

### Fase 1: Vuelo de Ida
- Recomienda el aeropuerto alemán más cercano al origen o código postal de recogida (e.g. MUC si es Múnich, STR si es Stuttgart/Sindelfingen, BER si es Berlín, HAJ/FRA si es Wolfsburgo/norte).
- Incluye enlace de búsqueda con texto descriptivo a Skyscanner (https://www.skyscanner.es/).

### Fase 2: Trámites de Salida (Alemania)
- Indica qué hacer al llegar al concesionario o vendedor en Alemania.
- Explica los requisitos para conseguir las matrículas temporales de exportación (Ausfuhrkennzeichen - placas rojas) y seguro temporal (eVB-Nummer) en la oficina de tráfico local (Zulassungsstelle). Advierte explícitamente que NO compren las placas amarillas (Kurzzeitkennzeichen), ya que son ilegales para transitar por Francia hacia España.

### Fase 3: Ruta por Carretera
- Proporciona un itinerario de conducción realista con kilómetros totales.
- Calcula el coste estimado de carburante basado en el consumo medio y precio introducido.
- Indica las autovías principales (Autobahn en Alemania, peajes de autopistas en Francia como la A6/A9/A10/A63, y la AP-8 en España).
- Incluye consejos de conducción (limitar a 130 km/h en tramos libres de Autobahn por seguridad y eficiencia de consumo).

### Fase 4: Alojamientos Recomendados
- Sugiere exactamente ${state.hotelNights} paradas intermedias lógicas de descanso entre Alemania y España (ej. Lyon, Clermont-Ferrand, Burdeos o San Sebastián dependiendo del origen).
- Incluye enlace de búsqueda activo con texto descriptivo a Booking.com (https://www.booking.com/searchresults.html?ss=...) para cada ciudad de parada.

Por favor, utiliza viñetas cortas, títulos profesionales de fase y un tono muy alentador y experto.`;

            setTimeout(async () => {
                try {
                    let planText = '';
                    
                    if (state.geminiApiKey && state.geminiApiKey !== '') {
                        try {
                            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.geminiApiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: promptText }] }],
                                    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 }
                                })
                            });
                            
                            if (!response.ok) throw new Error('API Error response');
                            
                            const data = await response.json();
                            planText = data.candidates[0].content.parts[0].text;
                        } catch (err) {
                            console.warn("Real Gemini call failed. Running local expert fallback travel generator.", err);
                            planText = getLocalTravelPlan(originCity, destCity, activeCar, state.hotelNights, state.fuelPrice, state.language);
                        }
                    } else {
                        planText = getLocalTravelPlan(originCity, destCity, activeCar, state.hotelNights, state.fuelPrice, state.language);
                    }
                    
                    generatedRawPlanText = planText;
                    
                    if (timelineTravelAI) {
                        timelineTravelAI.innerHTML = parseMarkdownToTimeline(planText);
                    }
                    
                    if (cardTravelAI) {
                        cardTravelAI.style.display = 'block';
                        cardTravelAI.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    
                } catch (err) {
                    console.error("Error generating travel plan", err);
                    alert("Ocurrió un error al generar el plan de viaje. Por favor, inténtalo de nuevo.");
                } finally {
                    btnTriggerTravelAI.disabled = false;
                    if (spinnerTravelAI) spinnerTravelAI.classList.add('hidden');
                    if (textTravelAI) textTravelAI.textContent = dict.travel_btn_ai || 'Crear Plan de Viaje con IA';
                }
            }, 1200);
        });
    }

    if (btnCopyTravelPlan) {
        btnCopyTravelPlan.addEventListener('click', () => {
            if (!generatedRawPlanText) return;
            
            const cleanText = generatedRawPlanText
                .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)')
                .replace(/###/g, '');
                
            navigator.clipboard.writeText(cleanText).then(() => {
                const dict = translations[state.language] || translations['es'];
                alert(dict.travel_ai_copy_success || '¡Itinerario copiado al portapapeles!');
            }).catch(err => {
                console.error('Error copying text', err);
            });
        });
    }

    // Booking.com and Trivago hotel search triggers
    const btnSearchHotels = document.getElementById('btn-trigger-hotel-search');
    if (btnSearchHotels) {
        btnSearchHotels.addEventListener('click', () => {
            const city = document.getElementById('hotel-search-city').value || 'Munich';
            
            // Generate deep search link to Booking.com
            const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}`;
            
            // Animate button search visual mock
            btnSearchHotels.textContent = 'Buscando...';
            setTimeout(() => {
                btnSearchHotels.textContent = 'Buscar Hoteles';
                
                // Alert simulation or direct opening
                alert(`Abriendo Booking.com para buscar alojamientos en: ${city}`);
                window.open(bookingUrl, '_blank');
            }, 800);
        });
    }

    // Carrier Select confirmation
    const btnSelectCarrier = document.getElementById('btn-select-carrier');
    if (btnSelectCarrier) {
        btnSelectCarrier.addEventListener('click', () => {
            alert('¡Servicio de portacoches seleccionado! Coste de grúa (950€) integrado en tu presupuesto general.');
            runTaxCalculations();
            switchTab('page-dashboard');
        });
    }


    // ==========================================================================
    // 6. CHECKLIST INTERACTIVE WORKFLOW
    // ==========================================================================
    
    // Checklist phase filter buttons
    const btnPhaseGer = document.getElementById('btn-phase-ger');
    const btnPhaseEsp = document.getElementById('btn-phase-esp');
    const gerContainer = document.getElementById('chk-germany-container');
    const espContainer = document.getElementById('chk-spain-container');

    if (btnPhaseGer) {
        btnPhaseGer.addEventListener('click', () => {
            btnPhaseGer.classList.add('active');
            btnPhaseEsp.classList.remove('active');
            gerContainer.classList.add('active');
            espContainer.classList.remove('active');
        });
    }

    if (btnPhaseEsp) {
        btnPhaseEsp.addEventListener('click', () => {
            btnPhaseEsp.classList.add('active');
            btnPhaseGer.classList.remove('active');
            espContainer.classList.add('active');
            gerContainer.classList.remove('active');
        });
    }

    // Dynamic Expandable items onClick headers
    const checklistCards = document.querySelectorAll('.checklist-card');
    checklistCards.forEach(card => {
        const header = card.querySelector('.card-chk-header');
        header.addEventListener('click', (e) => {
            // If user clicked the checkbox input itself, don't toggle accordion expand
            if (e.target.tagName === 'INPUT') return;

            const isAlreadyActive = card.classList.contains('active');
            
            // Collapse all
            checklistCards.forEach(c => c.classList.remove('active'));
            
            // Toggle clicked card
            if (!isAlreadyActive) {
                card.classList.add('active');
            }
        });
    });

    // Checkbox State change triggers Progress Updates
    const checkboxes = document.querySelectorAll('.checklist-card input[type="checkbox"]');
    checkboxes.forEach(chk => {
        chk.addEventListener('change', () => {
            const card = chk.closest('.checklist-card');
            const chkId = card.getAttribute('data-chk-id');
            
            state.checklist[chkId] = chk.checked;
            
            if (chkId === 'ger-3') {
                syncDocumentUploadState('factura', chk.checked);
            } else if (chkId === 'esp-1') {
                syncDocumentUploadState('itv', chk.checked);
            } else {
                if (chk.checked) {
                    card.classList.add('done');
                } else {
                    card.classList.remove('done');
                }
                updateProgress();
            }
        });
    });

    // Calculate dynamic progress completion circle & dashboard details
    const updateProgress = () => {
        const checkKeys = Object.keys(state.checklist);
        const total = checkKeys.length; // 8 checks
        let completedCount = 0;
        
        checkKeys.forEach(key => {
            if (state.checklist[key]) completedCount++;
        });

        const percent = Math.round((completedCount / total) * 100);

        // Update circular progress visual
        const strokeDashOffset = 100 - percent;
        const progressCircle = document.getElementById('dashboard-progress-circle');
        const progressText = document.getElementById('dashboard-progress-text');
        
        if (progressCircle) {
            progressCircle.style.strokeDasharray = `${percent}, 100`;
        }
        if (progressText) {
            progressText.textContent = `${percent}%`;
        }

        // Sync Dashboard texts
        const stepLabel = document.getElementById('current-step-label');
        const stepDesc = document.getElementById('current-step-desc');
        
        if (percent < 50) {
            if (stepLabel) stepLabel.textContent = 'Fase 1: En Alemania';
            if (stepDesc) stepDesc.textContent = 'Buscando el vehículo ideal y coordinando NeedCarHelp...';
        } else if (percent < 90) {
            if (stepLabel) stepLabel.textContent = 'Fase 2: En España';
            if (stepDesc) stepDesc.textContent = 'Pasando la inspección ITV y liquidando el Modelo 576 de impuestos...';
        } else {
            if (stepLabel) stepLabel.textContent = 'Fase Final: DGT';
            if (stepDesc) stepDesc.textContent = 'Matrícula española concedida. ¡Listo para montar placas definitivas!';
        }

        // Sync visual flows on Dashboard Peek steps
        peekSync();
    };

    const peekSync = () => {
        const flowItems = document.querySelectorAll('.flow-list .flow-item');
        flowItems.forEach(item => {
            const stepId = item.getAttribute('data-step');
            
            // Clear status
            item.classList.remove('active', 'current');
            const statusEl = item.querySelector('.flow-status');
            if (statusEl) statusEl.remove();

            if (stepId === '1') {
                if (state.checklist['ger-1'] && state.checklist['inspect']) {
                    item.classList.add('active');
                    item.insertAdjacentHTML('beforeend', '<span class="flow-status completed">Hecho</span>');
                } else {
                    item.classList.add('current');
                }
            } else if (stepId === '2') {
                if (state.checklist['ger-3'] && state.checklist['ger-4']) {
                    item.classList.add('active');
                    item.insertAdjacentHTML('beforeend', '<span class="flow-status completed">Hecho</span>');
                } else if (state.checklist['ger-1']) {
                    item.classList.add('current');
                    item.insertAdjacentHTML('beforeend', '<span class="flow-status pending">En curso</span>');
                }
            } else if (stepId === '3') {
                // Trip planning stage
                if (state.logisticsType === 'drive' && state.checklist['ger-4']) {
                    item.classList.add('current');
                }
            }
        });
    };

    // Initialize progress calculations
    updateProgress();


    // ==========================================================================
    // 7. SECURE DOCUMENT VAULT & CAMERA SCANNER SIMULATOR
    // ==========================================================================
    const scannerModal = document.getElementById('scanner-modal');
    const btnCapture = document.getElementById('btn-capture-doc');
    const btnCloseScanner = document.getElementById('btn-close-scanner');
    
    let activeScanTarget = null; // factura, coc, permit, itv

    // Open scanner interface
    const openScanner = (target) => {
        activeScanTarget = target;
        scannerModal.style.display = 'flex';
    };

    const closeScanner = () => {
        scannerModal.style.display = 'none';
        activeScanTarget = null;
    };

    // Bind all upload buttons in the Vault page
    const vaultScanButtons = document.querySelectorAll('.btn-vault-scan');
    vaultScanButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-scan-target');
            openScanner(target);
        });
    });

    // Bind checklist card upload buttons
    const checklistUploadButtons = document.querySelectorAll('.btn-upload-doc');
    checklistUploadButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-doc-type');
            openScanner(target);
        });
    });

    if (btnCloseScanner) {
        btnCloseScanner.addEventListener('click', closeScanner);
    }

    // Capture Document Trigger (Simulated scan complete animation)
    if (btnCapture) {
        btnCapture.addEventListener('click', () => {
            // Shutter capture flash animation
            scannerModal.style.transition = 'none';
            scannerModal.style.backgroundColor = '#fff';
            
            setTimeout(() => {
                scannerModal.style.transition = 'background-color 0.4s ease';
                scannerModal.style.backgroundColor = '#000';
                
                // Document upload logic success callbacks
                setTimeout(() => {
                    documentUploadedSuccess(activeScanTarget);
                    closeScanner();
                }, 400);
            }, 100);
        });
    }

    const syncDocumentUploadState = (docType, isUploaded) => {
        state.uploadedDocs[docType] = isUploaded;
        
        // Synchronize Checklist card UI
        let chkId = null;
        if (docType === 'factura') chkId = 'ger-3';
        if (docType === 'itv') chkId = 'esp-1';
        
        if (chkId) {
            const card = document.querySelector(`[data-chk-id="${chkId}"]`);
            if (card) {
                const uploadBadge = document.getElementById(`badge-uploaded-${docType}`);
                const scanBtn = card.querySelector('.btn-upload-doc');
                
                if (isUploaded) {
                    card.classList.add('done');
                    const chkBox = document.getElementById(`chk-${chkId}`);
                    if (chkBox) chkBox.checked = true;
                    if (uploadBadge) uploadBadge.style.display = 'flex';
                    if (scanBtn) scanBtn.style.display = 'none';
                    state.checklist[chkId] = true;
                } else {
                    card.classList.remove('done');
                    const chkBox = document.getElementById(`chk-${chkId}`);
                    if (chkBox) chkBox.checked = false;
                    if (uploadBadge) uploadBadge.style.display = 'none';
                    if (scanBtn) scanBtn.style.display = 'inline-flex';
                    state.checklist[chkId] = false;
                }
            }
        }

        // Synchronize Documents Vault card UI
        const vaultItem = document.getElementById(`vault-${docType}`);
        if (vaultItem) {
            const dot = vaultItem.querySelector('.doc-dot-status');
            const desc = vaultItem.querySelector('.doc-name-desc p');
            const btn = vaultItem.querySelector('.btn-vault-scan');
            
            if (isUploaded) {
                vaultItem.classList.add('uploaded');
                if (dot) {
                    dot.classList.remove('empty');
                    dot.classList.add('uploaded');
                }
                if (desc) desc.textContent = `Scanned_Doc_${docType.toUpperCase()}_Verified.pdf`;
                if (btn) btn.textContent = 'Ver';
            } else {
                vaultItem.classList.remove('uploaded');
                if (dot) {
                    dot.classList.add('empty');
                    dot.classList.remove('uploaded');
                }
                if (desc) desc.textContent = state.language === 'en' ? 'Pending upload' : state.language === 'de' ? 'Ausstehend' : 'Pendiente de subir';
                if (btn) btn.textContent = state.language === 'en' ? 'Upload' : state.language === 'de' ? 'Hochladen' : 'Subir';
            }
        }
        
        updateProgress();
    };

    const documentUploadedSuccess = (docType) => {
        const docName = docType === 'factura' 
            ? (state.language === 'en' ? 'INVOICE' : state.language === 'de' ? 'RECHNUNG' : 'FACTURA')
            : 'ITV';
        const msg = state.language === 'en'
            ? `Document "${docName}" scanned successfully and secured in the vault.`
            : state.language === 'de'
            ? `Dokument "${docName}" erfolgreich gescannt und im Tresor gesichert.`
            : `Documento "${docName}" escaneado con éxito e incorporado de forma segura.`;
        alert(msg);
        syncDocumentUploadState(docType, true);
    };

    // Remove Scanned document binds
    const removeBadges = document.querySelectorAll('.remove-doc');
    removeBadges.forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = badge.closest('.uploaded-doc-badge');
            const docType = parent.id.replace('badge-uploaded-', '');
            syncDocumentUploadState(docType, false);
        });
    });

    // ==========================================================================
    // 9. MULTI-LANGUAGE TRANSLATION ENGINE (SPANISH, ENGLISH, GERMAN)
    // ==========================================================================
    state.language = localStorage.getItem('manza_lang') || 'es';

    const translations = {
        es: {
            dashboard: 'Inicio',
            search: 'Búsqueda',
            calculator: 'Calculadora',
            travel: 'Viaje',
            checklist: 'Paso a Paso',
            documents: 'Documentos',
            
            // Dashboard
            prog_title: 'Progreso de Importación',
            est_budget: 'Presupuesto Estimado',
            tot_est_cost: 'Coste Total Estimado de Importación',
            taxes_es: 'Impuestos España',
            log_travel: 'Logística Viaje',
            plates_admin: 'Placas & Trámites',
            car_not_incl: 'Precio coche no incluido:',
            import_route: 'Tu Ruta de Importación',
            view_all: 'Ver todo',
            checklist_title: 'Tu Guía Paso a Paso',
            documents_title: 'Mis Documentos',
            
            // Breakdown Modal
            breakdown_title: 'Desglose Detallado de Costes',
            breakdown_total_project: 'Presupuesto Total de Importación',
            breakdown_gauge_title: 'Distribución del Presupuesto',
            breakdown_seg_car: 'Vehículo',
            breakdown_seg_taxes: 'Impuestos',
            breakdown_seg_logistics: 'Logística',
            breakdown_seg_fees: 'Trámites',
            breakdown_cat_car: 'Precio de Compra del Vehículo',
            breakdown_sub_cat_car: 'Coste de adquisición del coche en el vendedor alemán.',
            breakdown_cat_taxes: 'Impuestos de Importación',
            breakdown_sub_cat_taxes: 'Modelo 576 (Impuesto Matriculación) + Impuesto de Transmisiones Patrimoniales (ITP).',
            breakdown_cat_logistics: 'Logística de Transporte y Viaje',
            breakdown_sub_cat_logistics: 'Vuelos, placas de matrícula temporales, seguro, peajes, combustible y noches de hotel.',
            breakdown_cat_fees: 'Trámites Administrativos y Placas',
            breakdown_sub_cat_fees: 'Ficha reducida e ITV, tasas de la DGT para placas provisionales y definitivas, y comisión de gestión.',
            breakdown_btn_print: 'Exportar Presupuesto a PDF',
            
            // Search Tab
            search_title: 'Búsqueda & Comparador IA',
            search_desc: 'Busca en portales alemanes, añade hasta 4 coches al panel de comparación y analízalos con el Asistente Gemini AI.',
            panel_title: 'Panel de Coches Seleccionados',
            panel_sub: 'Selecciona al menos 2 vehículos para compararlos con Inteligencia Artificial.',
            btn_presets: 'Cargar Coches de Prueba',
            btn_add_manual: '+ Añadir Coche',
            btn_compare_trigger: 'Comparar en Ventana con IA Gemini \u2192',
            empty_panel: 'No hay coches en el panel. Carga los coches de prueba o añade uno de forma manual.',
            inspect_suggested_title: 'Revisores Técnicos Recomendados',
            inspect_suggested_desc: 'Busca y compara otros centros oficiales o mecánicos de revisión técnica en Alemania. Te sugerimos el más adecuado según la ubicación del coche.',
            inspect_clear_btn: 'Limpiar',
            inspect_search_placeholder: 'Buscar revisores por nombre, ciudad...',
            inspect_email_title: 'Borrador de Correo de Solicitud',
            inspect_email_desc: 'Revisa el mensaje preparado y envíalo al revisor en un toque:',
            inspect_email_to: 'Para:',
            inspect_email_subject: 'Asunto:',
            inspect_email_send: 'Enviar Correo de Solicitud \u2192',
            
            // Calculator Tab
            calc_title: 'Calculadora de Importación',
            calc_desc: 'Estima con precisión todos los impuestos españoles (Modelo 576, ITP por provincias) y tasas de nacionalización.',
            car_data: 'Datos del Vehículo',
            calc_price_lbl: 'Precio de Compra',
            calc_co2_lbl: 'Emisiones de CO\u2082 (g/km)',
            calc_power_lbl: 'Potencia del Coche (CV)',
            calc_province_lbl: 'Provincia de Matriculación (España)',
            calc_context: 'Contexto de Compra',
            calc_invoice_lbl: '\u00bfEl vendedor emite factura?',
            calc_invoice_sub: 'S\u00cd = Profesional con IVA. NO = Particular (se aplica ITP).',
            calc_luxury_lbl: 'Vehículo de Lujo o Gran Valor',
            calc_luxury_sub: 'Costes arancelarios especiales.',
            calc_damaged_lbl: 'Vehículo Averiado / Dañado',
            calc_damaged_sub: 'Aplica descuentos de valoración.',
            calc_family_lbl: 'Familia Numerosa',
            calc_family_sub: 'Bonificación del 50% en Impuesto Matriculación.',
            calc_age_lbl: 'Antigüedad (Meses)',
            calc_km_lbl: 'Kilometraje (km)',
            calc_results_lbl: 'Presupuesto Detallado',
            calc_save_btn: 'Aplicar Presupuesto al Flujo',
            calc_suggest_title: 'Vehículos Seleccionados (Presupuestos IA)',
            calc_suggest_btn_load: 'Cargar',
            calc_suggest_btn_loaded: 'Cargado',
            calc_suggest_total: 'Total Proyecto',
            calc_suggest_import: 'Coste Import.',
            
            // Travel Tab
            travel_title: 'Viaje & Alojamiento',
            travel_desc: 'Planifica tu viaje para recoger el vehículo en Alemania o contrata transporte en portacoches.',
            travel_drive: 'Ir a por él',
            travel_carrier: 'Portacoches',
            travel_origin_lbl: 'Ciudad Origen (Alemania)',
            travel_dest_lbl: 'Destino (España)',
            hotel_search_lbl: '\u00bfDónde quieres buscar hotel?',
            hotel_nights_lbl: 'Noches de Alojamiento en la Ruta',
            hotel_btn_search: 'Buscar Hoteles',
            hotel_search_title: 'Buscar Alojamiento para la Ruta',
            hotel_search_sub: 'Busca hoteles en tu ciudad de recogida o a mitad de camino para descansar.',
            travel_btn_ai: 'Crear Plan de Viaje con IA',
            travel_ai_title: 'Ruta de Importación Personalizada',
            travel_ai_loading: 'Generando itinerario con IA...',
            travel_ai_success: '¡Itinerario generado con éxito por la IA!',
            travel_ai_copy_success: '¡Itinerario copiado al portapapeles!',
            
            // Settings Modal
            settings_title: 'Ajustes de Perfil & API',
            settings_save_btn: 'Guardar Ajustes',
            settings_api_lbl: 'Configuración de API de Gemini',
            
            // Messages
            success_budget_msg: 'Presupuesto aplicado con éxito al panel de control de tu importación.',
            settings_saved_msg: 'Ajustes y API Key de Gemini guardados correctamente.',
            max_cars_msg: 'El panel soporta un máximo de 4 coches a la vez.',
            select_brand_model_msg: 'Por favor, rellena al menos Marca y Modelo.'
        },
        en: {
            dashboard: 'Home',
            search: 'Search',
            calculator: 'Calculator',
            travel: 'Travel',
            checklist: 'Step by Step',
            documents: 'Documents',
            
            // Dashboard
            prog_title: 'Import Progress',
            est_budget: 'Estimated Budget',
            tot_est_cost: 'Total Estimated Cost of Import',
            taxes_es: 'Spain Taxes',
            log_travel: 'Travel Logistics',
            plates_admin: 'Plates & Fees',
            car_not_incl: 'Car price not included:',
            import_route: 'Your Import Route',
            view_all: 'View all',
            checklist_title: 'Your Step-by-Step Guide',
            documents_title: 'My Documents',
            
            // Breakdown Modal
            breakdown_title: 'Detailed Cost Breakdown',
            breakdown_total_project: 'Total Import Project Budget',
            breakdown_gauge_title: 'Budget Allocation',
            breakdown_seg_car: 'Vehicle',
            breakdown_seg_taxes: 'Taxes',
            breakdown_seg_logistics: 'Logistics',
            breakdown_seg_fees: 'Fees/Admin',
            breakdown_cat_car: 'Vehicle Purchase Price',
            breakdown_sub_cat_car: 'Acquisition cost of the car at the German dealer.',
            breakdown_cat_taxes: 'Import Taxes',
            breakdown_sub_cat_taxes: 'Modelo 576 (Registration Tax) + Property Transfer Tax (ITP).',
            breakdown_cat_logistics: 'Transport & Travel Logistics',
            breakdown_sub_cat_logistics: 'Flights, temporary export license plates, insurance, tolls, fuel, and hotel lodging.',
            breakdown_cat_fees: 'Administrative Fees & Plates',
            breakdown_sub_cat_fees: 'Reduced sheet and ITV inspection, DGT fees for temp/perm plates, and agency management fee.',
            breakdown_btn_print: 'Export Budget to PDF',
            
            // Search Tab
            search_title: 'Search & AI Comparator',
            search_desc: 'Search in German portals, add up to 4 cars to the selection panel, and analyze them with Gemini AI.',
            panel_title: 'Selected Cars Panel',
            panel_sub: 'Select at least 2 vehicles to compare them with Artificial Intelligence.',
            btn_presets: 'Load Test Cars',
            btn_add_manual: '+ Add Custom Car',
            btn_compare_trigger: 'Compare in Window with Gemini AI \u2192',
            empty_panel: 'No cars in the panel. Load test presets or add a vehicle manually.',
            inspect_suggested_title: 'Recommended Technical Reviewers',
            inspect_suggested_desc: 'Search and compare other official centers or technical review mechanics in Germany. We suggest the most suitable one based on the car\'s location.',
            inspect_clear_btn: 'Clear',
            inspect_search_placeholder: 'Search reviewers by name or city...',
            inspect_email_title: 'Request Email Draft',
            inspect_email_desc: 'Review the prepared message and send it to the reviewer in one tap:',
            inspect_email_to: 'To:',
            inspect_email_subject: 'Subject:',
            inspect_email_send: 'Send Request Email \u2192',
            
            // Calculator Tab
            calc_title: 'Import Calculator',
            calc_desc: 'Accurately estimate all Spanish taxes (Modelo 576, ITP by province) and nationalization fees.',
            car_data: 'Vehicle Specifications',
            calc_price_lbl: 'Purchase Price',
            calc_co2_lbl: 'CO\u2082 Emissions (g/km)',
            calc_power_lbl: 'Engine Power (HP)',
            calc_province_lbl: 'Registration Province (Spain)',
            calc_context: 'Purchase Context',
            calc_invoice_lbl: 'Does seller issue invoice?',
            calc_invoice_sub: 'YES = Professional (VAT). NO = Private Seller (ITP applies).',
            calc_luxury_lbl: 'Luxury or High-Value Vehicle',
            calc_luxury_sub: 'Special customs fees apply.',
            calc_damaged_lbl: 'Damaged / Faulty Vehicle',
            calc_damaged_sub: 'Applies valuation discounts.',
            calc_family_lbl: 'Large Family Status',
            calc_family_sub: '50% discount on Registration Tax.',
            calc_age_lbl: 'Age (Months)',
            calc_km_lbl: 'Mileage (km)',
            calc_results_lbl: 'Itemized Budget',
            calc_save_btn: 'Apply Budget to Dashboard',
            calc_suggest_title: 'Selected Vehicles (AI Budgets)',
            calc_suggest_btn_load: 'Load',
            calc_suggest_btn_loaded: 'Loaded',
            calc_suggest_total: 'Total Project',
            calc_suggest_import: 'Import Cost',
            
            // Travel Tab
            travel_title: 'Travel & Lodging',
            travel_desc: 'Plan your trip to collect your vehicle in Germany or hire a professional car carrier.',
            travel_drive: 'Drive Home',
            travel_carrier: 'Car Carrier',
            travel_origin_lbl: 'Origin City (Germany)',
            travel_dest_lbl: 'Destination (Spain)',
            hotel_search_lbl: 'Where do you want to search for hotels?',
            hotel_nights_lbl: 'Hotel Nights Along the Route',
            hotel_btn_search: 'Search Hotels',
            hotel_search_title: 'Find Lodging for Your Route',
            hotel_search_sub: 'Find hotels in your collection city or intermediate stops to rest.',
            travel_btn_ai: 'Create AI Travel Plan',
            travel_ai_title: 'Personalized Import Route',
            travel_ai_loading: 'Generating route with AI...',
            travel_ai_success: 'Itinerary successfully generated by AI!',
            travel_ai_copy_success: 'Itinerary copied to clipboard!',
            
            // Settings Modal
            settings_title: 'Profile Settings & API',
            settings_save_btn: 'Save Settings',
            settings_api_lbl: 'Gemini API Configuration',
            
            // Messages
            success_budget_msg: 'Budget successfully applied to your importation dashboard.',
            settings_saved_msg: 'Settings and Gemini API Key successfully saved.',
            max_cars_msg: 'The panel supports a maximum of 4 cars at a time.',
            select_brand_model_msg: 'Please fill in at least Brand and Model.'
        },
        de: {
            dashboard: 'Start',
            search: 'Suche',
            calculator: 'Rechner',
            travel: 'Reise',
            checklist: 'Schritte',
            documents: 'Dokumente',
            
            // Dashboard
            prog_title: 'Importfortschritt',
            est_budget: 'Geschätztes Budget',
            tot_est_cost: 'Geschätzte Gesamtkosten des Imports',
            taxes_es: 'Spanische Steuern',
            log_travel: 'Reiselogistik',
            plates_admin: 'Schilder & Gebühren',
            car_not_incl: 'Fahrzeugpreis nicht enthalten:',
            import_route: 'Ihre Importroute',
            view_all: 'Alle anzeigen',
            checklist_title: 'Ihre Schritt-für-Schritt-Anleitung',
            documents_title: 'Meine Dokumente',
            
            // Breakdown Modal
            breakdown_title: 'Detaillierte Kostenaufstellung',
            breakdown_total_project: 'Gesamtbudget für Importprojekt',
            breakdown_gauge_title: 'Budgetaufteilung',
            breakdown_seg_car: 'Fahrzeug',
            breakdown_seg_taxes: 'Steuern',
            breakdown_seg_logistics: 'Logistik',
            breakdown_seg_fees: 'Gebühren',
            breakdown_cat_car: 'Fahrzeugkaufpreis',
            breakdown_sub_cat_car: 'Anschaffungskosten des Wagens beim deutschen Händler.',
            breakdown_cat_taxes: 'Einfuhrsteuern',
            breakdown_sub_cat_taxes: 'Modelo 576 (Zulassungssteuer) + Eigentumsübertragungssteuer (ITP).',
            breakdown_cat_logistics: 'Transport- und Reiselogistik',
            breakdown_sub_cat_logistics: 'Flüge, Überführungskennzeichen, Versicherung, Maut, Kraftstoff und Hotelübernachtungen.',
            breakdown_cat_fees: 'Verwaltungsgebühren & Kennzeichen',
            breakdown_sub_cat_fees: 'COC/TÜV-Datenblatt und ITV-Inspektion, DGT-Gebühren für Kurzzeit-/Dauer-Kennzeichen und Vermittlung.',
            breakdown_btn_print: 'Budget als PDF exportieren',
            
            // Search Tab
            search_title: 'Suche & KI-Vergleich',
            search_desc: 'Suchen Sie in deutschen Portalen, fügen Sie bis zu 4 Autos zum Panel hinzu und vergleichen Sie sie mit Gemini-KI.',
            panel_title: 'Ausgewählte Fahrzeuge',
            panel_sub: 'Wählen Sie mindestens 2 Autos aus, um sie mit künstlicher Intelligenz zu vergleichen.',
            btn_presets: 'Testwagen laden',
            btn_add_manual: '+ Auto hinzufügen',
            btn_compare_trigger: 'Mit Gemini-KI im Fenster vergleichen \u2192',
            empty_panel: 'Keine Autos im Panel. Laden Sie Testwagen oder fügen Sie manuell einen hinzu.',
            inspect_suggested_title: 'Empfohlene technische Prüfer',
            inspect_suggested_desc: 'Suchen und vergleichen Sie andere offizielle Zentren oder technische Prüfer in Deutschland. Wir empfehlen den am besten geeigneten basierend auf dem Standort des Autos.',
            inspect_clear_btn: 'Löschen',
            inspect_search_placeholder: 'Prüfer nach Name oder Stadt suchen...',
            inspect_email_title: 'E-Mail-Entwurf für Anfrage',
            inspect_email_desc: 'Überprüfen Sie den Entwurf und senden Sie ihn mit einem Klick an den Prüfer:',
            inspect_email_to: 'An:',
            inspect_email_subject: 'Betreff:',
            inspect_email_send: 'Anfrage-E-Mail senden \u2192',
            
            // Calculator Tab
            calc_title: 'Importrechner',
            calc_desc: 'Schätzen Sie präzise alle spanischen Steuern (Modelo 576, ITP nach Provinzen) und Zulassungsgebühren.',
            car_data: 'Fahrzeugdaten',
            calc_price_lbl: 'Kaufpreis',
            calc_co2_lbl: 'CO\u2082-Emissionen (g/km)',
            calc_power_lbl: 'Leistung (PS)',
            calc_province_lbl: 'Spanische Zulassungsprovinz',
            calc_context: 'Kaufkontext',
            calc_invoice_lbl: 'Stellt der Verkäufer eine Rechnung aus?',
            calc_invoice_sub: 'JA = Gewerblich (inkl. MwSt.). NEIN = Privatverkauf (ITP fällt an).',
            calc_luxury_lbl: 'Luxus- oder Premiumfahrzeug',
            calc_luxury_sub: 'Spezielle Zollgebühren fallen an.',
            calc_damaged_lbl: 'Beschädigtes / Defektes Fahrzeug',
            calc_damaged_sub: 'Wendet Bewertungsrabatte an.',
            calc_family_lbl: 'Kinderreiche Familie',
            calc_family_sub: '50% Rabatt auf die Zulassungssteuer.',
            calc_age_lbl: 'Alter (Monate)',
            calc_km_lbl: 'Kilometerstand (km)',
            calc_results_lbl: 'Detailliertes Budget',
            calc_save_btn: 'Budget auf Dashboard anwenden',
            calc_suggest_title: 'Ausgewählte Fahrzeuge (KI-Budgets)',
            calc_suggest_btn_load: 'Laden',
            calc_suggest_btn_loaded: 'Geladen',
            calc_suggest_total: 'Gesamtprojekt',
            calc_suggest_import: 'Importkosten',
            
            // Travel Tab
            travel_title: 'Reise & Unterkunft',
            travel_desc: 'Planen Sie Ihre Reise zur Abholung in Deutschland oder beauftragen Sie einen Autotransporter.',
            travel_drive: 'Selbst abholen',
            travel_carrier: 'Autotransporter',
            travel_origin_lbl: 'Abholort (Deutschland)',
            travel_dest_lbl: 'Zielort (Spanien)',
            hotel_search_lbl: 'Wo möchten Sie nach Hotels suchen?',
            hotel_nights_lbl: 'Übernachtungen auf der Route',
            hotel_btn_search: 'Hotels suchen',
            hotel_search_title: 'Unterkunft für Ihre Route finden',
            hotel_search_sub: 'Finden Sie Hotels in Ihrer Abholstadt oder Zwischenstopps zum Ausruhen.',
            travel_btn_ai: 'KI-Reiseplan erstellen',
            travel_ai_title: 'Personalisierte Importroute',
            travel_ai_loading: 'Route wird mit KI generiert...',
            travel_ai_success: 'Reiseroute erfolgreich von KI generiert!',
            travel_ai_copy_success: 'Reiseroute in die Zwischenablage kopiert!',
            
            // Settings Modal
            settings_title: 'Profileinstellungen & API',
            settings_save_btn: 'Einstellungen speichern',
            settings_api_lbl: 'Gemini-API-Konfiguration',
            
            // Messages
            success_budget_msg: 'Budget erfolgreich auf Ihr Dashboard angewendet.',
            settings_saved_msg: 'Einstellungen und Gemini-API-Key erfolgreich gespeichert.',
            max_cars_msg: 'Das Panel unterstützt maximal 4 Autos gleichzeitig.',
            select_brand_model_msg: 'Bitte füllen Sie mindestens Marke und Modell aus.'
        }
    };

    const applyLanguage = (lang) => {
        const dict = translations[lang] || translations['es'];
        
        // 1. Navigation Buttons
        const navBtns = document.querySelectorAll('.device-nav-bar .nav-btn');
        if (navBtns.length >= 6) {
            navBtns[0].querySelector('span').textContent = dict.dashboard;
            navBtns[1].querySelector('span').textContent = dict.search;
            navBtns[2].querySelector('span').textContent = dict.calculator;
            navBtns[3].querySelector('span').textContent = dict.travel;
            navBtns[4].querySelector('span').textContent = dict.checklist;
            navBtns[5].querySelector('span').textContent = dict.documents;
        }
        
        // 2. Headings & Main Labels (using custom selections)
        const updateText = (selector, text) => {
            const el = document.querySelector(selector);
            if (el) el.textContent = text;
        };
        
        // Dashboard Translations
        updateText('#page-dashboard .dashboard-progress-card h3', dict.prog_title);
        updateText('#page-dashboard .section-title h2', dict.import_route);
        updateText('#page-dashboard .section-title #btn-peek-checklist', dict.view_all);
        updateText('#page-dashboard .scroll-container .section-title:nth-of-type(2) h2', dict.est_budget);
        updateText('#page-dashboard .budget-label', dict.tot_est_cost);
        updateText('#page-dashboard .budget-grid-item:nth-child(1) span', dict.taxes_es);
        updateText('#page-dashboard .budget-grid-item:nth-child(2) span', dict.log_travel);
        updateText('#page-dashboard .budget-grid-item:nth-child(3) span', dict.plates_admin);
        
        // Search View Translations
        updateText('#page-search h2', dict.search_title);
        updateText('#page-search .page-desc', dict.search_desc);
        updateText('#page-search .panel-header-row h3', dict.panel_title);
        updateText('#page-search .panel-sub', dict.panel_sub);
        updateText('#page-search #btn-load-presets', dict.btn_presets);
        updateText('#page-search #btn-toggle-add-form', dict.btn_add_manual);
        updateText('#page-search #btn-trigger-comparison', dict.btn_compare_trigger);
        const placeholderText = document.querySelector('#compare-cars-placeholder p');
        if (placeholderText) placeholderText.textContent = dict.empty_panel;
        
        // Technical inspection Module 2 Translations
        updateText('#inspect-suggested-title', dict.inspect_suggested_title);
        updateText('#desc-inspect-suggested', dict.inspect_suggested_desc);
        updateText('#btn-inspect-clear-search', dict.inspect_clear_btn);
        const inspectSearch = document.getElementById('inspect-search-input');
        if (inspectSearch) inspectSearch.placeholder = dict.inspect_search_placeholder;
        updateText('#inspect-email-title', dict.inspect_email_title);
        updateText('#inspect-email-desc', dict.inspect_email_desc);
        updateText('#inspect-email-to', dict.inspect_email_to);
        updateText('#inspect-email-subject', dict.inspect_email_subject);
        updateText('#btn-send-email-mailto', dict.inspect_email_send);
        syncInspectCarSelect(); // Refresh select option text translations
        updateReviewerRecommendations(); // Re-render cards with updated region/price labels
        
        // Calculator View Translations
        updateText('#page-calculator h2', dict.calc_title);
        updateText('#page-calculator .page-desc', dict.calc_desc);
        updateText('#page-calculator .calc-section-title:nth-of-type(1)', dict.car_data);
        updateText('#page-calculator .slider-group:nth-of-type(1) label', dict.calc_price_lbl);
        updateText('#page-calculator .slider-group:nth-of-type(2) label', dict.calc_co2_lbl);
        updateText('#page-calculator .slider-group:nth-of-type(3) label', dict.calc_power_lbl);
        updateText('#page-calculator .form-group-select label', dict.calc_province_lbl);
        updateText('#page-calculator .calc-section-title:nth-of-type(2)', dict.calc_context);
        updateText('#page-calculator .toggle-card:nth-of-type(1) h4', dict.calc_invoice_lbl);
        updateText('#page-calculator .toggle-card:nth-of-type(1) p', dict.calc_invoice_sub);
        updateText('#page-calculator .toggle-card:nth-of-type(2) h4', dict.calc_luxury_lbl);
        updateText('#page-calculator .toggle-card:nth-of-type(2) p', dict.calc_luxury_sub);
        updateText('#page-calculator .toggle-card:nth-of-type(3) h4', dict.calc_damaged_lbl);
        updateText('#page-calculator .toggle-card:nth-of-type(3) p', dict.calc_damaged_sub);
        updateText('#page-calculator .toggle-card:nth-of-type(4) h4', dict.calc_family_lbl);
        updateText('#page-calculator .toggle-card:nth-of-type(4) p', dict.calc_family_sub);
        updateText('#page-calculator .form-row .form-group:nth-child(1) label', dict.calc_age_lbl);
        updateText('#page-calculator .form-row .form-group:nth-child(2) label', dict.calc_km_lbl);
        updateText('#page-calculator .calc-results-card h3', dict.calc_results_lbl);
        updateText('#page-calculator #btn-save-calc-budget', dict.calc_save_btn);
        updateText('#calc-suggest-title', dict.calc_suggest_title);
        renderCalculatorSuggestions();
        
        // Travel View Translations
        updateText('#page-travel h2', dict.travel_title);
        updateText('#page-travel .page-desc', dict.travel_desc);
        updateText('#page-travel #tab-log-drive span', dict.travel_drive);
        updateText('#page-travel #tab-log-carrier span', dict.travel_carrier);
        updateText('#btn-trigger-travel-ai #btn-travel-ai-text', dict.travel_btn_ai);
        updateText('#travel-ai-plan-card #travel-ai-card-title', dict.travel_ai_title);
        updateText('#page-travel .form-row .form-group:nth-child(1) label', dict.travel_origin_lbl);
        updateText('#page-travel .form-row .form-group:nth-child(2) label', dict.travel_dest_lbl);
        updateText('#page-travel .hotel-section-header h3', dict.hotel_search_title);
        updateText('#page-travel .hotel-finder-section .section-sub', dict.hotel_search_sub);
        updateText('#page-travel .hotel-search-card label', dict.hotel_search_lbl);
        updateText('#page-travel #btn-trigger-hotel-search', dict.hotel_btn_search);
        updateText('#page-travel .slider-header label', dict.hotel_nights_lbl);
        
        // Checklist View Translations
        updateText('#page-checklist h2', dict.checklist_title);
        
        // Documents View Translations
        updateText('#page-documents h2', dict.documents_title);
        
        // Cost Breakdown Modal Translations
        updateText('#breakdown-modal-title', dict.breakdown_title);
        updateText('#breakdown-lbl-total-project', dict.breakdown_total_project);
        updateText('#breakdown-gauge-title', dict.breakdown_gauge_title);
        updateText('#breakdown-lbl-seg-car', dict.breakdown_seg_car);
        updateText('#breakdown-lbl-seg-taxes', dict.breakdown_seg_taxes);
        updateText('#breakdown-lbl-seg-logistics', dict.breakdown_seg_logistics);
        updateText('#breakdown-lbl-seg-fees', dict.breakdown_seg_fees);
        updateText('#breakdown-lbl-cat-car', dict.breakdown_cat_car);
        updateText('#breakdown-sub-cat-car', dict.breakdown_sub_cat_car);
        updateText('#breakdown-lbl-cat-taxes', dict.breakdown_cat_taxes);
        updateText('#breakdown-sub-cat-taxes', dict.breakdown_sub_cat_taxes);
        updateText('#breakdown-lbl-cat-logistics', dict.breakdown_cat_logistics);
        updateText('#breakdown-sub-cat-logistics', dict.breakdown_sub_cat_logistics);
        updateText('#breakdown-lbl-cat-fees', dict.breakdown_cat_fees);
        updateText('#breakdown-sub-cat-fees', dict.breakdown_sub_cat_fees);
        updateText('#breakdown-btn-print', dict.breakdown_btn_print);
        updateCostBreakdownUI(); // Update values inside breakdown card based on language fuel label details
        
        // Modals Titles
        updateText('#settings-modal .scanner-header span', dict.settings_title);
        updateText('#settings-modal .settings-card h4:nth-of-type(1)', dict.settings_api_lbl);
        updateText('#settings-modal #btn-save-settings', dict.settings_save_btn);
        
        // Sync selected language label
        const langDropdown = document.getElementById('lang-selector');
        if (langDropdown) langDropdown.value = lang;
        
        // Sync active warning banners
        const budgetCard = document.getElementById('dash-budget-car-price');
        if (budgetCard) {
            budgetCard.textContent = `${dict.car_not_incl} ${state.price.toLocaleString('es-ES')} €`;
        }
    };

    // Lang selector change listener
    const langSelect = document.getElementById('lang-selector');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            const chosenLang = e.target.value;
            state.language = chosenLang;
            localStorage.setItem('manza_lang', chosenLang);
            applyLanguage(chosenLang);
        });
    }

    // Botón Lupa en el flujo para navegar a la pestaña de Búsqueda (NEW)
    const btnFlowSearchLupa = document.getElementById('btn-flow-search-lupa');
    if (btnFlowSearchLupa) {
        btnFlowSearchLupa.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que dispare otros clics de acordeones o contenedores
            switchTab('page-search');
        });
    }

    // Lógica para reiniciar todo el proceso (NEW)
    const btnResetAllProcess = document.getElementById('btn-reset-all-process');
    if (btnResetAllProcess) {
        btnResetAllProcess.addEventListener('click', () => {
            const confirmReset = confirm(state.language === 'en' 
                ? 'Are you sure you want to reset all import progress and data?' 
                : state.language === 'de'
                ? 'Sind Sie sicher, dass Sie den gesamten Importfortschritt zurücksetzen möchten?'
                : '¿Estás seguro de que deseas reiniciar todo el progreso de la importación?');
            
            if (confirmReset) {
                // 1. Resetear el estado del checklist
                Object.keys(state.checklist).forEach(key => {
                    state.checklist[key] = false;
                });
                
                // Desmarcar todos los checkboxes físicos del checklist
                const chkBoxes = document.querySelectorAll('.checklist-card input[type="checkbox"]');
                chkBoxes.forEach(chk => {
                    chk.checked = false;
                    const card = chk.closest('.checklist-card');
                    if (card) card.classList.remove('done');
                });

                // 2. Resetear documentos del vault
                Object.keys(state.uploadedDocs).forEach(key => {
                    state.uploadedDocs[key] = false;
                    syncDocumentUploadState(key, false);
                });

                // 3. Resetear inspect form y booking success
                const bookingSuccess = document.getElementById('booking-success');
                const bookingBox = document.getElementById('booking-box');
                const inspectionForm = document.getElementById('inspection-form');
                if (bookingSuccess) bookingSuccess.style.display = 'none';
                if (bookingBox) bookingBox.style.display = 'block';
                if (inspectionForm) inspectionForm.reset();

                // 4. Ocultar el plan de viaje de la IA
                const cardTravelAI = document.getElementById('travel-ai-plan-card');
                if (cardTravelAI) cardTravelAI.style.display = 'none';
                generatedRawPlanText = '';

                // 5. Resetear valores de la calculadora a sus valores por defecto
                state.price = 25000;
                state.co2 = 135;
                state.power = 150;
                state.km = 45000;
                state.ageMonths = 36;
                state.sellerInvoice = true;
                state.luxury = false;
                state.damaged = false;
                state.largeFamily = false;
                state.activeCarId = null;

                // Sync de la calculadora
                updateCalculatorUI();

                // 6. Volver a renderizar la lista de coches (presets para facilidad de pruebas)
                state.selectedCars = JSON.parse(JSON.stringify(presetCars));
                // Desmarcar todos los seleccionados para comparar por defecto
                state.selectedCars.forEach(c => c.selected = false);
                renderCarList();

                // 7. Actualizar el presupuesto del dashboard al valor por defecto
                document.getElementById('dash-budget-total').textContent = '0 €';
                const dict = translations[state.language] || translations['es'];
                document.getElementById('dash-budget-car-price').textContent = `${dict.car_not_incl || 'Precio coche no incluido:'} 0 €`;
                document.getElementById('dash-budget-taxes').textContent = '0 €';
                document.getElementById('dash-budget-logistics').textContent = '0 €';
                document.getElementById('dash-budget-admin').textContent = '0 €';

                // 8. Forzar la actualización del progreso al 0%
                updateProgress();

                alert(state.language === 'en'
                    ? 'All import data has been reset to zero!'
                    : state.language === 'de'
                    ? 'Alle Importdaten wurden auf Null zurückgesetzt!'
                    : '¡Todos los datos de importación han sido reiniciados a cero!');
                
                switchTab('page-dashboard');
            }
        });
    }

    // Routing based on URL Query Parameters (NEW)
    const handleUrlRouting = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tab = urlParams.get('tab');
        const phase = urlParams.get('phase');
        const expand = urlParams.get('expand');

        if (tab) {
            switchTab(tab);

            if (tab === 'page-checklist') {
                if (phase === 'ger') {
                    const btnPhaseGer = document.getElementById('btn-phase-ger');
                    if (btnPhaseGer) {
                        btnPhaseGer.classList.add('active');
                        const btnPhaseEsp = document.getElementById('btn-phase-esp');
                        if (btnPhaseEsp) btnPhaseEsp.classList.remove('active');
                        
                        const gerContainer = document.getElementById('chk-germany-container');
                        const espContainer = document.getElementById('chk-spain-container');
                        if (gerContainer) gerContainer.classList.add('active');
                        if (espContainer) espContainer.classList.remove('active');
                    }
                } else if (phase === 'esp') {
                    const btnPhaseEsp = document.getElementById('btn-phase-esp');
                    if (btnPhaseEsp) {
                        btnPhaseEsp.classList.add('active');
                        const btnPhaseGer = document.getElementById('btn-phase-ger');
                        if (btnPhaseGer) btnPhaseGer.classList.remove('active');
                        
                        const gerContainer = document.getElementById('chk-germany-container');
                        const espContainer = document.getElementById('chk-spain-container');
                        if (espContainer) espContainer.classList.add('active');
                        if (gerContainer) gerContainer.classList.remove('active');
                    }

                    if (expand === 'esp-4') {
                        setTimeout(() => {
                            const cardDgt = document.querySelector('[data-chk-id="esp-4"]');
                            if (cardDgt) {
                                const header = cardDgt.querySelector('.card-chk-header');
                                if (header && !cardDgt.classList.contains('active')) {
                                    header.click();
                                }
                                cardDgt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 250);
                    }
                }
            }
        }
    };

    // Función centralizada para navegar al paso correspondiente del flujo localmente (NEW)
    const triggerFlowStep = (step) => {
        if (step === '1') {
            switchTab('page-search');
        } else if (step === '2') {
            switchTab('page-checklist');
            const btnPhaseGer = document.getElementById('btn-phase-ger');
            if (btnPhaseGer) {
                btnPhaseGer.classList.add('active');
                const btnPhaseEsp = document.getElementById('btn-phase-esp');
                if (btnPhaseEsp) btnPhaseEsp.classList.remove('active');
                
                const gerContainer = document.getElementById('chk-germany-container');
                const espContainer = document.getElementById('chk-spain-container');
                if (gerContainer) gerContainer.classList.add('active');
                if (espContainer) espContainer.classList.remove('active');
            }
        } else if (step === '3') {
            switchTab('page-travel');
        } else if (step === '4') {
            switchTab('page-checklist');
            const btnPhaseEsp = document.getElementById('btn-phase-esp');
            if (btnPhaseEsp) {
                btnPhaseEsp.classList.add('active');
                const btnPhaseGer = document.getElementById('btn-phase-ger');
                if (btnPhaseGer) btnPhaseGer.classList.remove('active');
                
                const gerContainer = document.getElementById('chk-germany-container');
                const espContainer = document.getElementById('chk-spain-container');
                if (espContainer) espContainer.classList.add('active');
                if (gerContainer) gerContainer.classList.remove('active');
            }
        } else if (step === '5') {
            switchTab('page-checklist');
            const btnPhaseEsp = document.getElementById('btn-phase-esp');
            if (btnPhaseEsp) {
                btnPhaseEsp.classList.add('active');
                const btnPhaseGer = document.getElementById('btn-phase-ger');
                if (btnPhaseGer) btnPhaseGer.classList.remove('active');
                
                const gerContainer = document.getElementById('chk-germany-container');
                const espContainer = document.getElementById('chk-spain-container');
                if (espContainer) espContainer.classList.add('active');
                if (gerContainer) gerContainer.classList.remove('active');
            }
            
            // Expandir automáticamente el acordeón final de DGT (esp-4) y hacer scroll suave
            setTimeout(() => {
                const cardDgt = document.querySelector('[data-chk-id="esp-4"]');
                if (cardDgt) {
                    const header = cardDgt.querySelector('.card-chk-header');
                    if (header && !cardDgt.classList.contains('active')) {
                        header.click();
                    }
                    cardDgt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 250);
        }
    };

    // Hacer clickable e interactiva toda la Ruta de Importación rápida del Inicio (NEW)
    const flowItems = document.querySelectorAll('.flow-list .flow-item');
    flowItems.forEach(item => {
        let touchMoved = false;

        // Enlazar eventos de toque para iluminación instantánea (highlight) en iPhone
        item.addEventListener('touchstart', () => {
            touchMoved = false;
            item.classList.add('active-touch');
        }, { passive: true });

        item.addEventListener('touchmove', () => {
            touchMoved = true;
        }, { passive: true });

        item.addEventListener('touchend', (e) => {
            item.classList.remove('active-touch');
            if (!touchMoved) {
                // Si el usuario toca específicamente en la lupa del paso 1, no duplicar el trigger
                if (e.target.id === 'btn-flow-search-lupa') return;
                
                const step = item.getAttribute('data-step');
                triggerFlowStep(step);
                e.preventDefault(); // Evitar la duplicación de clics y delay de 300ms en iOS
            }
        });

        item.addEventListener('touchcancel', () => {
            item.classList.remove('active-touch');
        }, { passive: true });

        item.addEventListener('click', (e) => {
            // Si el usuario hace clic específicamente en la lupa del paso 1, no duplicar el trigger
            if (e.target.id === 'btn-flow-search-lupa') return;
            
            const step = item.getAttribute('data-step');
            triggerFlowStep(step);
        });
    });

    // Run initial settings
    applyLanguage(state.language);

    // Run initial tax calculations in calculator engine to populate active variables
    runTaxCalculations();

    // Parse query parameters and route accordingly
    handleUrlRouting();

});
