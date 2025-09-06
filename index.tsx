/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { render, createContext } from 'preact';
import { useState, useMemo, useCallback, useContext, useEffect, useRef } from 'preact/hooks';
import { html } from 'htm/preact';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Fuse from 'fuse.js';

// Helper function to provide style context for visual generation
const getStyleDescriptionForOfficeType = (officeType, style) => {
    if (style) {
        return `a user-specified '${style}'`;
    }
    switch (officeType) {
        case 'Startup': return 'a collaborative and modern feel with vibrant accents, natural wood, and possibly some industrial elements';
        case 'Corporate': return 'a professional and structured look with a neutral color palette (grays, blues), high-end finishes, and clean lines';
        case 'Creative Agency': return 'an eclectic and artistic vibe with bold colors, unique furniture pieces, and flexible, multi-use spaces';
        case 'Tech Hub': return 'a sleek, modern, and minimalist design, focusing on technology integration and perhaps incorporating brand colors';
        case 'Law Firm': return 'a traditional and elegant aesthetic, featuring dark wood, leather upholstery, and a sense of gravitas and stability';
        case 'Co-working Space': return 'a diverse, flexible, and comfortable environment with zoned areas that have different moods, often with a mix of industrial and residential touches';
        default: return 'a modern and functional';
    }
};

// Base64 encoded OBRA Office Furniture logo
const obraLogo = "PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDMwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHN0eWxlPi50ZXh0IHsgZm9udC1mYW1pbHk6ICdQbGF5ZmFpciBEaXNwbGF5Jywgc2VyaWY7IGZvbnQtc2l6ZTogNjBweDsgZm9udC13ZWlnaHQ6IDcwMDsgZmlsbDogIzFjMWUyMTsgfS5zaGFwZSB7IGZpbGw6ICMwZDZlZmQ7IH08L3N0eWxlPjxwYXRoIGNsYXNzPSJzaGFwZSIgZD0iTTI1LDIwIEwyNSw4MCBMNDUsODAgTDQ5LDUwIEw2NSw1MCBMNjUsODAgTDg1LDgwIEw4NSwyMCBMNjUsMjAgTDY1LDQwIEw0NSw0MCBMNDUsMjAgWiIgLz48dGV4dCB4PSIxMDAiIHk9Ijc1IiBjbGFzcz0idGV4dCI+T0JSQTwvdGV4dD48L3N2Zz4=";

const convertSvgToPng = (svgDataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 300; // Intrinsic width of the SVG
            canvas.height = 100; // Intrinsic height of the SVG
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const pngDataUrl = canvas.toDataURL('image/png');
                resolve(pngDataUrl);
            } else {
                reject(new Error("Could not get canvas context for SVG conversion."));
            }
        };
        img.onerror = (err) => {
            reject(new Error(`Failed to load SVG for conversion: ${err}`));
        };
        img.src = svgDataUrl;
    });
};

// --- Data (Updated from OBRA Catalog CSV without image URLs) ---
const initialProducts = [
    {"code":"22-FB03-EGC BLK 1.6m","name":"L-Type Executive Glass Top Table","category":"Executive Tables","dimensions":"L160cm x W80cm x H75cm","price":"20380","description":"12mm tempered glass, Melamine front panel, Aluminium alloy frame, Mobile pedestal."},
    {"code":"NKT-EGC-003 1.8M","name":"L-Type Executive Glass Top Table","category":"Executive Tables","dimensions":"L180cm x W80cm x H76cm","price":"22550","description":"12mm thickness glass counter top, Melamine legs, Melamine front panel, Extension table, Mobile pedestal."},
    {"code":"OFT-EGC-GA13","name":"L-Type Executive Glass Top Table","category":"Executive Tables","dimensions":"L160cm x W70cm x H76 cm","price":"21825","description":"Glass top, Metal frame and modesty, Grommet hole, Mobile pedestal with safety lock."},
    {"code":"SQ-EGC-1716 2m","name":"L-Type Executive Table","category":"Executive Tables","dimensions":"L180cm x W80cm x H76cm","price":"25200","description":"System unit bin, Side drawers with safety lock, Close-in cabinets, Grommet."},
    {"code":"CT-EGC-1808","name":"Corner Office Table","category":"Office Tables","dimensions":"L120cm x W80cm x H76cm","price":"6527","description":"Tubular Steel frame, Side rack for storage."},
    {"code":"STYTBL-EGC 1.2m","name":"Study Table","category":"Office Tables","dimensions":"L120cm x W60cm x H75cm","price":"7412","description":"MDF board, Wide leg room for comfort, Tubular steel frame (3 inches)."},
    {"code":"OFT-EGC-3092","name":"Office table with metal frame","category":"Office Tables","dimensions":"L120cm x W60cm x H75cm","price":"5450","description":"MDF board with laminated finish, Metal frame and modesty panel, With cable management on side legs."},
    {"code":"OT-EGC-614","name":"Melamine Office Table","category":"Office Tables","dimensions":"L140cm x W70cm x H76cm","price":"9450","description":"Melamine wood construction, Soft-close cabinet door, Grommet for cable management.","colors": [{ "name": "Natural Oak", "value": "#d2b48c" }, { "name": "Dark Walnut", "value": "#6f4e37" }, { "name": "White", "value": "#ffffff" }] },
    {"code":"NKT-EGC-006 1.4M","name":"2-tone Office Table","category":"Office Tables","dimensions":"L140cm x W70cm x H76cm","price":"7625","description":"Modern 2-tone design, Grommet, Cabinet with soft close door, Drawer with combi-lock."},
    {"code":"YS946-EGC-6 Blk","name":"Fabric Office Chair","category":"Office Chairs","dimensions":"L56cm x W46cm x H86cm","price":"2869","description":"360° swivel, Chrome plated star-base, Adjustable height, Fabric upholstery.","colors": [{ "name": "Black", "value": "#212529" }, { "name": "Gray", "value": "#6c757d" }, { "name": "Royal Blue", "value": "#0d6efd" }] },
    {"code":"109DJNSX-EGC-BLK","name":"Leatherette Office Chair","category":"Office Chairs","dimensions":"L57cm x W54cm x H106cm","price":"4215","description":"360° swivel, Chrome plated frame star-base, Adjustable height, Upholstered in leather (seat and backrest), Recline adjustment.","colors": [{ "name": "Black", "value": "#212529" }, { "name": "White", "value": "#f8f9fa" }] },
    {"code":"YS-EGC-1102","name":"Mesh Office Chair","category":"Office Chairs","dimensions":"L60cm x W49cm x H104cm","price":"3595","description":"360° swivel, Nylon plastic airflow backrest, Chrome plated star-base, Adjustable height.","colors": [{ "name": "Black", "value": "#212529" }, { "name": "Red", "value": "#dc3545" }, { "name": "Green", "value": "#198754" }] },
    {"code":"A041FJNSX-EGC","name":"High-back Leatherette Executive Chair","category":"Office Chairs","dimensions":"L60cm x W52cm x H101cm","price":"5160","description":"360° swivel, Chrome plated star-base, Soft seat cushion, Padded armrest."},
    {"code":"C-BD168 (HB)-EGC","name":"High back executive chair","category":"Office Chairs","dimensions":"N/A","price":"8650","description":"Leatherette back and seat, Aluminum armrest with padding, Aluminum starbase, Color: Black Brown.","colors": [{ "name": "Black Brown", "value": "#3d2b1f" }, { "name": "Black", "value": "#212529" }] },
    {"code":"22-FM01-EGC BLK","name":"Conference Glass Table","category":"Conference Tables","dimensions":"L240cm x W120cm x H75cm","price":"28465","description":"Tempered Glass top, Tubular steel frame, Grommet for cable management."},
    {"code":"SQ-EGC-1709 3.2m","name":"12-Seater Conference Table","category":"Conference Tables","dimensions":"L320cm x W120cm x H75cm","price":"20019","description":"Maximum 12 seating capacity, MDF board, Tubular steel legs."},
    {"code":"CFT-EGC-802 (3.2)","name":"Conference Table / Workstation","category":"Conference Tables","dimensions":"L320cm x W120cm x H75cm","price":"21975","description":"Can be used as a workstation, MDF board, Metal frame with center legs, With wire management, 2 Grommets."},
    {"code":"SQ-EGC-1707","name":"4-Seater Workstation","category":"Workstations","dimensions":"L240cm x W120cm x H75cm","price":"25900","description":"MDF board, Grommet, Space saver design, Cabinet storage with safety lock, Four seating capacity."},
    {"code":"OFT-EGC-8140","name":"4-Seater Workstation with Drawers","category":"Workstations","dimensions":"L280cm x W120cm x H75cm","price":"31625","description":"MDF board laminated finish, Grommet, Glass divider, 4 mobile drawers with safety lock, Metal legs."},
    {"code":"GF-EGC HF006","name":"Metal Mobile Pedestal","category":"Storage","dimensions":"L39cm x W50cm x H60cm","price":"4550","description":"Acid washed, phosphatized and electrostatic powder coating finish. Superior Gang drawer locking system, 2 personal drawers and 1 full filing drawer, Pencil tray."},
    {"code":"LD-EGC-A4","name":"Lateral Filing Steel Cabinet 4 Drawer","category":"Storage","dimensions":"L90cm x W45cm x H133cm","price":"10899","description":"Superior gang locking system with 2 keys, Full extension drawer with full handle, Full extension ball bearing drawer runners, Powder coated metal, Gauge 22."},
    {"code":"WLS-EGC-026","name":"Wardrobe Steel Cabinet","category":"Storage","dimensions":"L90cm x W50cm x H185cm","price":"9935","description":"2-columns 5-layer shelves, 2 swing doors, Combine shelving space with clothes-hanging space, Powder coated metal."},
    {"code":"3L-EGC-B6","name":"18-door Steel Locker Cabinet","category":"Storage","dimensions":"L90cm x W35cm x H180cm","price":"12095","description":"Powder coated metal, High quality cold-rolled steel, Recessed handles, card holder, air ventilation and padlock hasp (padlock not included)."}
];

const productBundles = [
    {
        id: 'bundle-exec-starter',
        name: 'Executive Starter Pack',
        description: 'A complete setup for a manager\'s office, combining elegance and functionality for peak productivity.',
        items: [
            { code: '22-FB03-EGC BLK 1.6m', quantity: 1 }, // L-Type Executive Glass Top Table
            { code: 'C-BD168 (HB)-EGC', quantity: 1 },    // High back executive chair
            { code: 'LD-EGC-A4', quantity: 1 }            // Lateral Filing Steel Cabinet
        ]
    },
    {
        id: 'bundle-team-hub-4',
        name: '4-Person Workstation Hub',
        description: 'Equip your team with this modern and efficient 4-seater workstation, complete with ergonomic chairs.',
        items: [
            { code: 'SQ-EGC-1707', quantity: 1 },    // 4-Seater Workstation
            { code: 'YS-EGC-1102', quantity: 4 },    // Mesh Office Chair
        ]
    }
];


const currencyRates = {
    PHP: { rate: 1, symbol: '₱' },
    USD: { rate: 0.017, symbol: '$' },
    EUR: { rate: 0.016, symbol: '€' },
};

const AppContext = createContext({
    cart: [],
    setCart: (value: any) => {},
    clientInfo: { name: '', company: '', contact: '', email: '' },
    setClientInfo: (value: any) => {},
    currency: 'PHP',
    setCurrency: (value: any) => {},
    generatedDescriptions: {},
    generating: {},
    generationError: {},
    generateDescription: async (product: any) => {},
    furnitechLayoutOptions: null,
    setFurnitechLayoutOptions: (value: any) => {},
    selectedLayoutIndex: null,
    setSelectedLayoutIndex: (value: any) => {},
    isPlanning: false,
    planError: '',
    generateLayoutPlan: async (options: any) => {},
    addLayoutToCart: (layout: any) => {},
    furnitechAssistantHistory: [],
    isFurnitechAssistantGenerating: false,
    furnitechAssistantError: '',
    generateFurnitechResponse: async (prompt: string, useWebSearch: boolean) => {},
    chatSummary: null,
    setChatSummary: (value: any) => {},
    isSummarizing: false,
    summarizeChat: async () => {},
    modalUrl: null,
    setModalUrl: (value: any) => {},
    generatedFurnitechImages: [],
    isGeneratingFurnitechImages: false,
    furnitechImageGenerationError: '',
    generateFurnitechImages: async (options: any) => {},
    editedFurnitechImageResults: [],
    setEditedFurnitechImageResults: (value: any) => {},
    isEditingFurnitechImage: false,
    setIsEditingFurnitechImage: (value: boolean) => {},
    furnitechImageEditingError: '',
    editFurnitechImage: async (options: any) => {},
    wishlist: [],
    setWishlist: (value: any) => {},
    generatedFurnitechVideoUrl: null,
    isGeneratingFurnitechVideo: false,
    furnitechVideoGenerationError: '',
    furnitechVideoGenerationStatus: '',
    generateFurnitechVideo: async (options: any) => {},
    isAuthenticated: false,
    setIsAuthenticated: (value: boolean) => {},
    showAuthModal: false,
    setShowAuthModal: (value: boolean) => {},
});

const formatCurrency = (amount, currency) => {
    const { symbol } = currencyRates[currency];
    const value = Number(amount) * currencyRates[currency].rate;
    return `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function OnboardingModal() {
    const [show, setShow] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    const FEATURES = [
      {
        icon: 'fa-solid fa-store',
        title: "Browse the Catalog",
        desc: "Explore desks, chairs, workstations, storage, and more."
      },
      {
        icon: 'fa-solid fa-file-invoice-dollar',
        title: "Build Your Quote",
        desc: "Add products and see your professional proposal update in real time."
      },
      {
        icon: 'fa-solid fa-user-tie',
        title: "Add Client Details",
        desc: "Keep all client info in one place for easy follow‑up."
      },
      {
        icon: 'fa-solid fa-comments-dollar',
        title: "Furnitech Assistant",
        desc: "Get instant product suggestions and design ideas."
      },
      {
        icon: 'fa-solid fa-drafting-compass',
        title: "Furnitech Space Planner",
        desc: "Describe your space and get Furnitech‑generated layouts tailored to your needs."
      }
    ];

    useEffect(() => {
        const seen = localStorage.getItem("hasSeenOnboarding");
        if (!seen) {
            setShow(true);
        }
    }, []);

    const closeModal = useCallback(() => {
        localStorage.setItem("hasSeenOnboarding", "true");
        setShow(false);
    }, []);

    const nextStep = useCallback(() => {
        if (currentStep < FEATURES.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            closeModal();
        }
    }, [currentStep, closeModal]);

    if (!show) return null;

    return html`
        <div class="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div class="onboarding-modal">
                <button onClick=${closeModal} class="modal-close-btn" aria-label="Close onboarding modal">×</button>
                
                <div class="onboarding-header">
                    <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Logo" class="onboarding-logo" />
                    <h1 id="onboarding-title">WELCOME TO OBRA</h1>
                    <p>Your space. Your style. Your quote — in minutes.</p>
                </div>

                <div class="onboarding-progress">
                    ${FEATURES.map((_, index) => html`
                        <div class="progress-dot ${index === currentStep ? 'active' : ''}"></div>
                    `)}
                </div>

                <div class="onboarding-feature">
                    <div class="feature-icon-wrapper">
                        <i class="${FEATURES[currentStep].icon}"></i>
                    </div>
                    <div class="feature-text">
                        <h2>${FEATURES[currentStep].title}</h2>
                        <p>${FEATURES[currentStep].desc}</p>
                    </div>
                </div>

                <div class="onboarding-actions">
                    <button onClick=${nextStep} class="btn btn-primary">
                        ${currentStep === FEATURES.length - 1 ? 'Get Started' : 'Next'}
                    </button>
                    <button onClick=${closeModal} class="btn-link">
                        Skip Intro
                    </button>
                </div>
            </div>
        </div>
    `;
}

function AuthModal() {
    const { showAuthModal, setShowAuthModal, setIsAuthenticated } = useContext(AppContext);

    if (!showAuthModal) return null;

    const handleAuth = () => {
        setIsAuthenticated(true);
        setShowAuthModal(false);
    };

    return html`
        <div class="modal-overlay" onClick=${() => setShowAuthModal(false)}>
            <div class="auth-modal" onClick=${e => e.stopPropagation()}>
                <button onClick=${() => setShowAuthModal(false)} class="modal-close-btn" aria-label="Close modal">×</button>
                <div class="auth-content">
                    <i class="fa-solid fa-lock-open auth-icon"></i>
                    <h2>Create Your Free Account</h2>
                    <p>Sign up to unlock powerful Furnitech features like the Space Planner, Image Studio, and Assistant.</p>
                    <div class="auth-actions">
                        <button onClick=${handleAuth} class="btn btn-primary">
                            <i class="fa-solid fa-user-plus"></i> Sign Up Now
                        </button>
                         <button onClick=${handleAuth} class="btn">
                            Log In
                        </button>
                    </div>
                    <p class="auth-note">For this demo, clicking either button will grant you access.</p>
                </div>
            </div>
        </div>
    `;
}

function GatedFeature({ children, title, iconClass, description }) {
    const { isAuthenticated, setShowAuthModal } = useContext(AppContext);

    if (isAuthenticated) {
        return children;
    }

    return html`
        <div class="card">
            <div class="gated-feature-placeholder">
                <div class="gated-content">
                    <div class="gated-icon-feature">
                        <i class="${iconClass}"></i>
                    </div>
                    <h3 class="gated-title">${title}</h3>
                    <p class="gated-description">${description}</p>
                    <button class="btn btn-primary" onClick=${() => setShowAuthModal(true)}>
                        <i class="fa-solid fa-unlock"></i> Unlock Feature
                    </button>
                </div>
            </div>
        </div>
    `;
}

function ProductCard({ product }) {
    const { cart, setCart, currency, generatedDescriptions, generating, generationError, generateDescription, wishlist, setWishlist } = useContext(AppContext);
    const [selectedColor, setSelectedColor] = useState(product.colors ? product.colors[0] : null);

    const isGenerating = generating[product.code];
    const description = generatedDescriptions[product.code];
    const error = generationError[product.code];

    const addToCart = () => {
        setCart(prevCart => {
            const cartId = product.code + (selectedColor ? `-${selectedColor.name}` : '');
            const existingItem = prevCart.find(item => item.cartId === cartId);
            if (existingItem) {
                return prevCart.map(item =>
                    item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1, selectedColor, cartId }];
        });
    };

    const handleGenerate = () => {
        if (!isGenerating) {
            generateDescription(product);
        }
    };
    
    const isInWishlist = wishlist.includes(product.code);

    const toggleWishlist = () => {
        setWishlist(prev => {
            if (prev.includes(product.code)) {
                return prev.filter(code => code !== product.code);
            }
            return [...prev, product.code];
        });
    };

    return html`
        <div class="product-card" aria-label="Product">
            <div class="product-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-sku">SKU: ${product.code}</p>
                <p class="product-dimensions">
                    <i class="fa-solid fa-ruler-combined"></i>
                    ${product.dimensions}
                </p>
                ${product.colors && html`
                    <div class="color-options">
                        <span class="color-label">Color:</span>
                        <div class="color-swatches">
                            ${product.colors.map(color => html`
                                <div
                                    class="color-swatch ${selectedColor?.name === color.name ? 'selected' : ''}"
                                    style=${{ backgroundColor: color.value }}
                                    onClick=${() => setSelectedColor(color)}
                                    data-tooltip=${color.name}
                                    aria-label=${`Select color ${color.name}`}
                                ></div>
                            `)}
                        </div>
                    </div>
                `}
                <div class="product-footer">
                    <p class="product-price">${formatCurrency(product.price, currency)}</p>
                    <div class="product-card-actions">
                         <button onClick=${toggleWishlist} class="btn-icon btn-wishlist ${isInWishlist ? 'active' : ''}" aria-label="${isInWishlist ? 'Remove from' : 'Add to'} wishlist" data-tooltip="Wishlist">
                            <i class="fa-solid fa-heart"></i>
                         </button>
                         <button onClick=${addToCart} class="btn btn-primary" aria-label="Add ${product.name} to cart" data-tooltip="Add to Cart">
                            <i class="fa-solid fa-cart-plus"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="product-furnitech-actions">
                <button onClick=${handleGenerate} disabled=${isGenerating} class="btn-furnitech-generate" aria-label="Generate Furnitech description for ${product.name}">
                     ${isGenerating ? html`<div class="loading-spinner-small"></div> Generating...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Description`}
                </button>
            </div>
            ${ (description || error) && html`
                <div class="furnitech-description-container">
                    ${error && html`<p class="furnitech-error-inline">${error}</p>`}
                    ${description && html`<p class="furnitech-description-text">${description}</p>`}
                </div>
            `}
        </div>
    `;
}

function LayoutPlanDisplay({ layout }) {
    const { currency, addLayoutToCart } = useContext(AppContext);

    if (!layout) return null;

    const totalItems = layout.zones.reduce((sum, zone) => sum + zone.furniture.reduce((s, f) => s + f.quantity, 0), 0);
    const totalCost = layout.zones.reduce((sum, zone) => {
        return sum + zone.furniture.reduce((s, f) => {
            const product = initialProducts.find(p => p.code === f.product_code);
            return s + (product ? Number(product.price) * f.quantity : 0);
        }, 0);
    }, 0);

    return html`
        <div class="layout-plan-display">
            <div class="layout-plan-header">
                <h3>${layout.title}</h3>
            </div>
            <div class="layout-plan-visual">
                <img src=${layout.imageUrl} alt="Visualization of ${layout.title}" />
            </div>
            <div class="layout-plan-summary">
                <div class="summary-item">
                    <span>Est. Cost</span>
                    <strong>${formatCurrency(totalCost, currency)}</strong>
                </div>
                <div class="summary-item">
                    <span>Total Items</span>
                    <strong>${totalItems}</strong>
                </div>
                 <div class="summary-item">
                    <span>Zones</span>
                    <strong>${layout.zones.length}</strong>
                </div>
            </div>
            <p class="layout-plan-notes" dangerouslySetInnerHTML=${{ __html: layout.layout_summary.replace(/\n/g, '<br />') }}></p>
            <div class="layout-plan-zones">
                ${layout.zones.map(zone => html`
                    <div class="zone-card" key=${zone.zone_name}>
                        <h4 class="zone-name"><i class="fa-solid fa-object-group"></i> ${zone.zone_name}</h4>
                        ${zone.zone_dimensions && html`<p class="zone-dims">Approx. Dimensions: ${zone.zone_dimensions}</p>`}
                        <ul class="furniture-list">
                            ${zone.furniture.map(item => {
                                const product = initialProducts.find(p => p.code === item.product_code);
                                if (!product) return null;
                                return html`
                                    <li key=${item.product_code}>
                                        <span class="furniture-qty">${item.quantity}x</span>
                                        <div class="furniture-details">
                                            <span class="furniture-name">${product.name}</span>
                                            <span class="furniture-price">${formatCurrency(product.price, currency)}</span>
                                        </div>
                                    </li>
                                `;
                            })}
                        </ul>
                    </div>
                `)}
            </div>
            <div class="layout-plan-actions">
                 <button onClick=${() => addLayoutToCart(layout)} class="btn btn-primary">
                    <i class="fa-solid fa-cart-plus"></i> Add All to Quote
                 </button>
            </div>
        </div>
    `;
}

function LayoutOptionCard({ option, index, isActive }) {
    const { currency, setSelectedLayoutIndex } = useContext(AppContext);

    const totalCost = useMemo(() => {
        return option.zones.reduce((sum, zone) => {
            return sum + zone.furniture.reduce((s, f) => {
                const product = initialProducts.find(p => p.code === f.product_code);
                return s + (product ? Number(product.price) * f.quantity : 0);
            }, 0);
        }, 0);
    }, [option]);

    return html`
        <div class="layout-option-card ${isActive ? 'active' : ''}" onClick=${() => setSelectedLayoutIndex(isActive ? null : index)}>
            <div class="layout-option-visual">
                ${option.imageUrl ? html`<img src=${option.imageUrl} alt="Visualization of ${option.title}" />`
                : option.imageError ? html`
                    <div class="visual-error">
                        <i class="fa-solid fa-image-slash"></i>
                        <span>${option.imageError}</span>
                    </div>`
                : html`
                    <div class="visual-loading">
                        <div class="loading-spinner-dark"></div>
                        <span>Generating Visual...</span>
                    </div>`
                }
            </div>
            <div class="layout-option-details">
                <h4 class="option-title">${option.title}</h4>
                <p class="option-description">${option.description}</p>
            </div>
            <div class="option-cost">
                <span>Estimated Cost</span>
                <strong>${formatCurrency(totalCost, currency)}</strong>
            </div>
        </div>
    `;
}

function FurnitechSpacePlanner() {
    const { isPlanning, planError, generateLayoutPlan, furnitechLayoutOptions, selectedLayoutIndex, setSelectedLayoutIndex } = useContext(AppContext);
    
    const [officeType, setOfficeType] = useState('Startup');
    const [customStyle, setCustomStyle] = useState('');
    const [length, setLength] = useState('10');
    const [width, setWidth] = useState('12');
    const [employees, setEmployees] = useState('8');
    const [zones, setZones] = useState('Open workstation area for 8, 1 small meeting room for 4, pantry, small reception');
    const [floorPlan, setFloorPlan] = useState(null);
    const fileInputRef = useRef(null);
    
    const planningMessages = useMemo(() => [
        "Analyzing your requirements...",
        "Consulting with our virtual designers...",
        "Selecting the perfect furniture pieces...",
        "Sketching out initial concepts...",
        "Generating layout visualizations...",
        "Finalizing the proposals...",
    ], []);
    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    useEffect(() => {
        let interval;
        if (isPlanning) {
            interval = setInterval(() => {
                setCurrentMessageIndex(prev => (prev + 1) % planningMessages.length);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isPlanning, planningMessages]);


    // Fix for errors where file properties were accessed on an 'unknown' type.
    // Added type to event and cast target to HTMLInputElement to correctly infer file type.
    // Also added a null check for event.target inside reader.onload for robustness.
    const handleFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target && typeof event.target.result === 'string') {
                    setFloorPlan({
                        name: file.name,
                        mimeType: file.type,
                        data: event.target.result.split(',')[1],
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };
    
    const clearFile = () => {
        setFloorPlan(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const options = {
            officeType,
            customStyle,
            length: Number(length),
            width: Number(width),
            employees: Number(employees),
            zones,
            floorPlan,
        };
        generateLayoutPlan(options);
    };
    
    const selectedLayout = furnitechLayoutOptions && selectedLayoutIndex !== null ? furnitechLayoutOptions[selectedLayoutIndex] : null;

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-drafting-compass"></i>
                    <h2 class="card-title">Furnitech Office Space Planner</h2>
                </div>
            </div>
             <p class="furnitech-feature-intro">
                Describe your space, and our Furnitech engine will generate three distinct layout concepts with visualizations and furniture recommendations from our catalog.
            </p>
            
            <form class="furnitech-planner-form" onSubmit=${handleSubmit}>
                <div class="form-row">
                    <div class="form-group-planner" style=${{flexBasis: '60%'}}>
                        <i class="fa-solid fa-building"></i>
                         <select value=${officeType} onChange=${e => setOfficeType(e.target.value)} style=${{paddingLeft: '3rem'}}>
                            <option value="Startup">Startup</option>
                            <option value="Corporate">Corporate</option>
                            <option value="Creative Agency">Creative Agency</option>
                            <option value="Tech Hub">Tech Hub</option>
                            <option value="Law Firm">Law Firm</option>
                            <option value="Co-working Space">Co-working Space</option>
                        </select>
                    </div>
                    <div class="form-group-planner" style=${{flexBasis: '40%'}}>
                        <i class="fa-solid fa-users"></i>
                        <input type="number" value=${employees} onInput=${e => setEmployees(e.target.value)} min="1" required />
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-planner">
                        <i class="fa-solid fa-ruler-horizontal"></i>
                        <input type="number" value=${length} onInput=${e => setLength(e.target.value)} min="1" placeholder="Length (m)" required />
                    </div>
                    <div class="form-group-planner">
                        <i class="fa-solid fa-ruler-vertical"></i>
                        <input type="number" value=${width} onInput=${e => setWidth(e.target.value)} min="1" placeholder="Width (m)" required />
                    </div>
                </div>
                <div class="form-group-planner">
                    <i class="fa-solid fa-palette"></i>
                    <input type="text" value=${customStyle} onInput=${e => setCustomStyle(e.target.value)} placeholder="Optional: Specify a custom style (e.g., 'Scandinavian minimalist')" />
                </div>
                <div class="form-group-planner">
                     <i class="fa-solid fa-layer-group" style=${{top: '1.2rem', transform: 'none'}}></i>
                     <textarea
                        value=${zones}
                        onInput=${e => setZones(e.target.value)}
                        placeholder="Describe required zones (e.g., 'Reception, 2 meeting rooms, pantry, open workstations')"
                        rows="3"
                        style=${{paddingLeft: '3rem'}}
                    ></textarea>
                </div>
                <div class="file-upload-wrapper">
                    <input type="file" id="floor-plan-upload" accept="image/*" onChange=${handleFileChange} ref=${fileInputRef} />
                    <label for="floor-plan-upload" class="btn">
                        <i class="fa-solid fa-upload"></i> Upload Floor Plan
                    </label>
                    ${floorPlan && html`
                        <div class="file-name-display">
                           <i class="fa-solid fa-file-image"></i>
                           <span>${floorPlan.name}</span>
                           <button type="button" class="btn-clear-file" onClick=${clearFile} aria-label="Remove file">×</button>
                        </div>
                    `}
                </div>

                <div class="furnitech-feature-actions">
                     <button type="submit" class="btn btn-primary" disabled=${isPlanning}>
                        ${isPlanning ? html`<div class="loading-spinner"></div> Generating...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Layouts`}
                    </button>
                </div>
            </form>

             ${isPlanning && html`
                <div class="loading-container">
                    <div class="loading-indicator-box" style=${{background: 'transparent', border: 'none', paddingBottom: 0, boxShadow: 'none'}}>
                        <p>${planningMessages[currentMessageIndex]}</p>
                    </div>
                    <div class="layout-options-grid">
                        ${[...Array(3)].map(() => html`
                            <div class="skeleton-layout-card">
                                <div class="skeleton skeleton-layout-image"></div>
                                <div class="skeleton-layout-details">
                                    <div class="skeleton skeleton-text" style=${{width: '50%', height: '1.2rem'}}></div>
                                    <div class="skeleton skeleton-text" style=${{width: '90%'}}></div>
                                    <div class="skeleton skeleton-text" style=${{width: '75%'}}></div>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            `}
            ${planError && html`<div class="furnitech-error">${planError}</div>`}

            ${furnitechLayoutOptions && html`
                <div class="generated-plan-wrapper">
                    <h3 class="generated-plan-title">Choose a Layout Concept</h3>
                    <div class="layout-options-grid">
                        ${furnitechLayoutOptions.map((option, index) => html`
                            <${LayoutOptionCard}
                                key=${index}
                                option=${option}
                                index=${index}
                                isActive=${selectedLayoutIndex === index}
                            />
                        `)}
                    </div>
                    ${selectedLayout && html`<${LayoutPlanDisplay} layout=${selectedLayout} />`}
                </div>
            `}
        </div>
    `;
}

function FurnitechImageStudio() {
    const { 
        generatedFurnitechImages, isGeneratingFurnitechImages, furnitechImageGenerationError, generateFurnitechImages,
        editedFurnitechImageResults, setEditedFurnitechImageResults, isEditingFurnitechImage, setIsEditingFurnitechImage, furnitechImageEditingError, editFurnitechImage 
    } = useContext(AppContext);

    const [mode, setMode] = useState('generate'); // 'generate' or 'edit'
    
    // State for generate mode
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [numImages, setNumImages] = useState(4);
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [quality, setQuality] = useState('standard');
    const [styles, setStyles] = useState([]);
    const [styleInput, setStyleInput] = useState('');

    // State for edit mode
    const [editPrompt, setEditPrompt] = useState('');
    const [editImages, setEditImages] = useState([]);
    const editFileInputRef = useRef(null);
    const [selection, setSelection] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const imageEditorRef = useRef(null);
    const [batchProgress, setBatchProgress] = useState(null);
    
    const QUALITY_OPTIONS = {
        'standard': '',
        'hd': ', high detail, sharp focus, intricate details',
        '4k': ', photorealistic, 4k resolution, ultra detailed, professional architectural rendering'
    };

    const STYLE_SUGGESTIONS = ['Cinematic Lighting', 'Vintage Poster', 'Minimalist', 'Art Deco', 'Cyberpunk', 'Watercolor', 'Sketch', 'Logo'];
    
    const handleAddStyle = (style) => {
        if (style && !styles.includes(style)) {
            setStyles([...styles, style]);
        }
        setStyleInput('');
    };
    
    const handleRemoveStyle = (styleToRemove) => {
        setStyles(styles.filter(s => s !== styleToRemove));
    };


    // Proactively fixed potential type errors and race conditions in file handling.
    // Added type to event, cast target to HTMLInputElement, and handled potential null files.
    // Ensured promises always resolve to prevent hangs.
    const handleFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files ? Array.from(target.files) : [];
        if (files.length > 0) {
            setSelection(null);
            const imagePromises = files.map(file => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target && typeof event.target.result === 'string') {
                            resolve({
                                name: file.name,
                                mimeType: file.type,
                                data: event.target.result.split(',')[1],
                            });
                        } else {
                            resolve(null);
                        }
                    };
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                });
            });
            Promise.all(imagePromises).then(newImages => {
                setEditImages(prev => [...prev, ...newImages.filter(Boolean)]);
            });
        }
    };

    const removeEditImage = (index) => {
        setEditImages(prev => prev.filter((_, i) => i !== index));
        if (editImages.length - 1 <= 1) {
            setSelection(null); // Clear selection if we go back to single image view
        }
    };
    
    const clearFiles = () => {
        setEditImages([]);
        setSelection(null);
        if (editFileInputRef.current) {
            editFileInputRef.current.value = "";
        }
    };

    const handleGenerateSubmit = (e) => {
        e.preventDefault();
        if (prompt.trim()) {
            const finalPrompt = `${prompt}${QUALITY_OPTIONS[quality]}${styles.length > 0 ? ', ' + styles.join(', ') : ''}`;
            generateFurnitechImages({ prompt: finalPrompt, negativePrompt, numImages: Number(numImages), aspectRatio });
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (editPrompt.trim() && editImages.length > 0 && !isEditingFurnitechImage) {
            setIsEditingFurnitechImage(true);
            setBatchProgress({ current: 1, total: editImages.length });
            setEditedFurnitechImageResults([]);

            for (let i = 0; i < editImages.length; i++) {
                setBatchProgress({ current: i + 1, total: editImages.length });
                const image = editImages[i];
                let mask = null;
                
                // Only create a mask if it's a single image and a selection exists
                if (editImages.length === 1 && selection && selection.width > 5 && selection.height > 5) {
                    const imageEl = imageEditorRef.current.querySelector('img');
                    const canvas = document.createElement('canvas');
                    canvas.width = imageEl.naturalWidth;
                    canvas.height = imageEl.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    
                    const scaleX = imageEl.naturalWidth / imageEl.clientWidth;
                    const scaleY = imageEl.naturalHeight / imageEl.clientHeight;
                    
                    const scaledSelection = {
                        x: selection.x * scaleX,
                        y: selection.y * scaleY,
                        width: selection.width * scaleX,
                        height: selection.height * scaleY,
                    };

                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'white';
                    ctx.fillRect(scaledSelection.x, scaledSelection.y, scaledSelection.width, scaledSelection.height);
                    
                    const maskDataUrl = canvas.toDataURL('image/png');
                    mask = {
                        data: maskDataUrl.split(',')[1],
                        mimeType: 'image/png'
                    };
                }
                
                await editFurnitechImage({ prompt: editPrompt, image, mask });
            }

            setIsEditingFurnitechImage(false);
            setBatchProgress(null);
        }
    };

    const downloadImage = (dataUrl, name) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `obra-image-${name}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const imageStudioMessages = useMemo(() => [
        "Warming up the digital canvas...",
        "Mixing the perfect colors...",
        "Our Furnitech engine is sketching the concept...",
        "Adding the finishing touches...",
        "Revealing the masterpiece...",
    ], []);
    
    const editingMessages = useMemo(() => [
        "Applying your creative direction...",
        "Our digital artist is making the changes...",
        "Blending the pixels perfectly...",
        "Adding the final touches to your edit...",
        "Revealing the updated image...",
    ], []);

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    useEffect(() => {
        let interval;
        if (isGeneratingFurnitechImages || isEditingFurnitechImage) {
            const messages = isGeneratingFurnitechImages ? imageStudioMessages : editingMessages;
            interval = setInterval(() => {
                setCurrentMessageIndex(prev => (prev + 1) % messages.length);
            }, 2500);
        }
        return () => clearInterval(interval);
    }, [isGeneratingFurnitechImages, isEditingFurnitechImage, imageStudioMessages, editingMessages]);

    const isLoading = isGeneratingFurnitechImages || isEditingFurnitechImage;
    const loadingMessage = isLoading 
        ? (isGeneratingFurnitechImages ? imageStudioMessages[currentMessageIndex] : editingMessages[currentMessageIndex])
        : '';
    
    const getCoords = (e) => {
        if (!imageEditorRef.current) return { x: 0, y: 0 };
        const rect = imageEditorRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleMouseDown = (e) => {
        if (editImages.length > 1) return;
        e.preventDefault();
        setIsDrawing(true);
        const coords = getCoords(e);
        setStartPos(coords);
        setSelection({ x: coords.x, y: coords.y, width: 0, height: 0 });
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || editImages.length > 1) return;
        const coords = getCoords(e);
        const newSelection = {
            x: Math.min(startPos.x, coords.x),
            y: Math.min(startPos.y, coords.y),
            width: Math.abs(coords.x - startPos.x),
            height: Math.abs(coords.y - startPos.y)
        };
        setSelection(newSelection);
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };
    
    const clearSelection = () => {
        setSelection(null);
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-paintbrush"></i>
                    <h2 class="card-title">Furnitech Image Studio</h2>
                </div>
            </div>
            
             <div class="studio-mode-toggle">
                <button class="mode-btn ${mode === 'generate' ? 'active' : ''}" onClick=${() => setMode('generate')}>
                    <i class="fa-solid fa-lightbulb"></i> Generate
                </button>
                <button class="mode-btn ${mode === 'edit' ? 'active' : ''}" onClick=${() => setMode('edit')}>
                    <i class="fa-solid fa-pen-ruler"></i> Edit
                </button>
            </div>

            ${mode === 'generate' && html`
                <div class="studio-form-container">
                    <p class="furnitech-feature-intro">
                        Generate logos, product mockups, or inspirational images. Describe what you want to see, and our Furnitech engine will bring it to life.
                    </p>
                    <form class="furnitech-image-studio-form" onSubmit=${handleGenerateSubmit}>
                        <div class="form-group-planner">
                            <i class="fa-solid fa-lightbulb" style=${{top: '1.2rem', transform: 'none'}}></i>
                            <textarea
                                value=${prompt}
                                onInput=${e => setPrompt(e.target.value)}
                                placeholder="e.g., 'A modern logo for OBRA Furniture, minimalist, using blue and gray'"
                                rows="3"
                                style=${{paddingLeft: '3rem'}}
                                required
                            ></textarea>
                        </div>
                        <div class="form-group-planner">
                            <i class="fa-solid fa-palette" style=${{top: '1.2rem', transform: 'none'}}></i>
                            <div class="style-tags-input">
                                <div class="tags-container">
                                    ${styles.map(s => html`
                                        <div class="tag-item" key=${s}>
                                            ${s}
                                            <button onClick=${() => handleRemoveStyle(s)}>×</button>
                                        </div>
                                    `)}
                                </div>
                                <input
                                    type="text"
                                    value=${styleInput}
                                    onInput=${e => setStyleInput(e.target.value)}
                                    onKeyDown=${(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddStyle(e.target.value); }}}
                                    placeholder="Add artistic styles..."
                                />
                            </div>
                        </div>
                        <div class="tag-suggestions">
                             ${STYLE_SUGGESTIONS.filter(s => !styles.includes(s)).map(s => html`
                                <button type="button" class="tag-suggestion-btn" onClick=${() => handleAddStyle(s)}>${s}</button>
                             `)}
                        </div>
                         <div class="form-group-planner">
                            <i class="fa-solid fa-ban" style=${{top: '1.2rem', transform: 'none'}}></i>
                            <textarea
                                value=${negativePrompt}
                                onInput=${e => setNegativePrompt(e.target.value)}
                                placeholder="Negative prompt: elements to exclude (e.g., 'text, watermarks, blurry')"
                                rows="2"
                                style=${{paddingLeft: '3rem'}}
                            ></textarea>
                        </div>
                        <div class="form-row">
                             <div class="form-group-planner">
                                 <i class="fa-solid fa-images"></i>
                                 <select value=${numImages} onChange=${e => setNumImages(Number(e.target.value))} style=${{paddingLeft: '3rem'}}>
                                    <option value="1">1 Variation</option>
                                    <option value="2">2 Variations</option>
                                    <option value="3">3 Variations</option>
                                    <option value="4">4 Variations</option>
                                </select>
                            </div>
                             <div class="form-group-planner">
                                 <i class="fa-solid fa-high-definition"></i>
                                 <select value=${quality} onChange=${e => setQuality(e.target.value)} style=${{paddingLeft: '3rem'}}>
                                    <option value="standard">Standard Quality</option>
                                    <option value="hd">High Detail</option>
                                    <option value="4k">4K Render</option>
                                </select>
                            </div>
                             <div class="form-group-planner">
                                 <i class="fa-solid fa-crop-simple"></i>
                                 <select value=${aspectRatio} onChange=${e => setAspectRatio(e.target.value)} style=${{paddingLeft: '3rem'}}>
                                    <option value="1:1">Square (1:1)</option>
                                    <option value="16:9">Landscape (16:9)</option>
                                    <option value="9:16">Portrait (9:16)</option>
                                     <option value="4:3">Standard (4:3)</option>
                                      <option value="3:4">Vertical (3:4)</option>
                                </select>
                            </div>
                        </div>
                         <div class="furnitech-feature-actions">
                             <button type="submit" class="btn btn-primary" disabled=${isGeneratingFurnitechImages}>
                                ${isGeneratingFurnitechImages ? html`<div class="loading-spinner"></div> Generating...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Images`}
                            </button>
                        </div>
                    </form>
                </div>
            `}
            
            ${mode === 'edit' && html`
                <div class="studio-form-container">
                    <p class="furnitech-feature-intro">
                        Upload one or more images, then tell our Furnitech engine how to change them.
                    </p>
                    <form class="furnitech-image-studio-form" onSubmit=${handleEditSubmit}>
                         <div class="file-upload-wrapper">
                            <input type="file" id="edit-image-upload" accept="image/*" onChange=${handleFileChange} ref=${editFileInputRef} required multiple />
                            <label for="edit-image-upload" class="btn">
                                <i class="fa-solid fa-upload"></i> Upload Image(s)
                            </label>
                            ${editImages.length > 0 && html`
                                <span class="file-count-chip">${editImages.length} image(s) selected</span>
                                <button type="button" class="btn-link" onClick=${clearFiles}>Clear</button>
                            `}
                        </div>
                        ${editImages.length > 0 && html`
                            <div class="image-batch-preview">
                                ${editImages.map((image, index) => html`
                                    <div class="preview-thumb-card" key=${index}>
                                        <img src=${`data:${image.mimeType};base64,${image.data}`} alt="Preview ${image.name}" />
                                        <button type="button" class="btn-remove-thumb" onClick=${() => removeEditImage(index)}>×</button>
                                    </div>
                                `)}
                            </div>
                        `}
                        ${editImages.length === 1 && html`
                             <div class="image-editor-container">
                                 <p class="editor-instruction">
                                     <i class="fa-solid fa-mouse-pointer"></i>
                                     ${selection ? 'Click and drag to adjust, or' : 'Optional: Click and drag on the image to select an area to edit.'}
                                     ${selection && html` <button type="button" class="btn-link" onClick=${clearSelection}>clear selection</button>`}
                                 </p>
                                 <div 
                                     class="image-editor" 
                                     ref=${imageEditorRef}
                                     onMouseDown=${handleMouseDown}
                                     onMouseMove=${handleMouseMove}
                                     onMouseUp=${handleMouseUp}
                                     onTouchStart=${handleMouseDown}
                                     onTouchMove=${handleMouseMove}
                                     onTouchEnd=${handleMouseUp}
                                 >
                                    <img src=${`data:${editImages[0].mimeType};base64,${editImages[0].data}`} alt="Image to edit" />
                                    ${selection && html`
                                        <div 
                                            class="selection-marquee"
                                            style=${{
                                                left: `${selection.x}px`,
                                                top: `${selection.y}px`,
                                                width: `${selection.width}px`,
                                                height: `${selection.height}px`,
                                            }}
                                        ></div>
                                    `}
                                 </div>
                             </div>
                         `}
                        <div class="form-group-planner">
                            <i class="fa-solid fa-wand-magic-sparkles" style=${{top: '1.2rem', transform: 'none'}}></i>
                            <textarea
                                value=${editPrompt}
                                onInput=${e => setEditPrompt(e.target.value)}
                                placeholder="e.g., 'Add a small, modern floor lamp next to the sofa'"
                                rows="3"
                                style=${{paddingLeft: '3rem'}}
                                required
                            ></textarea>
                        </div>
                         <div class="furnitech-feature-actions">
                             <button type="submit" class="btn btn-primary" disabled=${isEditingFurnitechImage || editImages.length === 0}>
                                ${isEditingFurnitechImage ? html`<div class="loading-spinner"></div> Editing...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Edit ${editImages.length > 0 ? `${editImages.length} Image(s)` : 'Image'}`}
                            </button>
                        </div>
                    </form>
                </div>
            `}

            ${isLoading && html`
                <div class="loading-container">
                    <div class="loading-indicator-box" style=${{background: 'transparent', border: 'none', paddingBottom: 0, boxShadow: 'none'}}>
                         <p>
                           ${isEditingFurnitechImage && batchProgress ? `Processing image ${batchProgress.current} of ${batchProgress.total}... ` : ''}
                           ${loadingMessage}
                        </p>
                    </div>
                    ${isGeneratingFurnitechImages && html`
                        <div class="generated-images-grid">
                            ${[...Array(numImages)].map(() => html`
                                <div class="skeleton skeleton-image-card"></div>
                            `)}
                        </div>
                    `}
                    ${isEditingFurnitechImage && html`
                        <div class="batch-results-grid">
                            ${[...Array(batchProgress?.total || 1)].map((_, i) => {
                                const result = editedFurnitechImageResults[i];
                                return result ? html`
                                    <div class="batch-result-card">
                                        <div class="result-pair">
                                            <div class="result-image-wrapper original">
                                                <img src=${result.originalUrl} alt="Original image" />
                                                <span class="image-label">Original</span>
                                            </div>
                                            <div class="result-image-wrapper edited">
                                                ${result.imageUrl && html`<img src=${result.imageUrl} alt="Edited image" />`}
                                                <span class="image-label">Edited</span>
                                            </div>
                                        </div>
                                    </div>
                                ` : html`
                                    <div class="skeleton-result-card">
                                        <div class="skeleton-result-pair">
                                            <div class="skeleton skeleton-edit-image"></div>
                                            <div class="skeleton skeleton-edit-image"></div>
                                        </div>
                                    </div>
                                `;
                            })}
                        </div>
                    `}
                </div>
            `}
            
            ${furnitechImageGenerationError && mode === 'generate' && html`<div class="furnitech-error">${furnitechImageGenerationError}</div>`}
            ${generatedFurnitechImages.length > 0 && mode === 'generate' && !isGeneratingFurnitechImages && html`
                 <div class="results-wrapper">
                    <h4 class="result-title">Generated Images</h4>
                    <div class="generated-images-grid">
                        ${generatedFurnitechImages.map((imgSrc, index) => html`
                            <div class="generated-image-card" key=${index}>
                                <img src=${imgSrc} alt="Furnitech generated image ${index + 1}" />
                                <div class="image-overlay">
                                    <button onClick=${() => downloadImage(imgSrc, `generated-${index + 1}`)} class="btn-download" aria-label="Download image" data-tooltip="Download">
                                        <i class="fa-solid fa-download"></i>
                                    </button>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            `}

            ${furnitechImageEditingError && mode === 'edit' && html`<div class="furnitech-error">${furnitechImageEditingError}</div>`}
            ${editedFurnitechImageResults.length > 0 && mode === 'edit' && !isEditingFurnitechImage && html`
                <div class="results-wrapper">
                    <h4 class="result-title">Edit Results</h4>
                    <div class="batch-results-grid">
                         ${editedFurnitechImageResults.map((result, index) => html`
                            <div class="batch-result-card" key=${index}>
                                <div class="result-pair">
                                    <div class="result-image-wrapper original">
                                        <img src=${result.originalUrl} alt="Original image ${index + 1}" />
                                        <span class="image-label">Original</span>
                                    </div>
                                    <div class="result-image-wrapper edited">
                                        ${result.imageUrl ? html`
                                            <img src=${result.imageUrl} alt="Edited image ${index + 1}" />
                                            <span class="image-label">Edited</span>
                                            <div class="image-overlay">
                                                <button onClick=${() => downloadImage(result.imageUrl, `edited-${index + 1}`)} class="btn-download" aria-label="Download image" data-tooltip="Download">
                                                    <i class="fa-solid fa-download"></i>
                                                </button>
                                            </div>
                                        ` : result.error ? html`
                                            <div class="result-error">
                                                <i class="fa-solid fa-circle-exclamation"></i>
                                                <span>${result.error}</span>
                                            </div>
                                        ` : null}
                                    </div>
                                </div>
                                ${result.text && html`
                                    <div class="edited-image-text">
                                        <p>${result.text}</p>
                                    </div>
                                `}
                            </div>
                         `)}
                    </div>
                </div>
            `}
        </div>
    `;
}

function FurnitechVideoStudio() {
    const { 
        generatedFurnitechVideoUrl, 
        isGeneratingFurnitechVideo, 
        furnitechVideoGenerationError, 
        furnitechVideoGenerationStatus, 
        generateFurnitechVideo 
    } = useContext(AppContext);

    const [prompt, setPrompt] = useState('');
    const [image, setImage] = useState(null);
    const fileInputRef = useRef(null);

    // Proactively fixed potential type errors similar to the ones reported.
    // Added type to event and cast target to HTMLInputElement to correctly infer file type.
    // Also added a null check for event.target inside reader.onload for robustness.
    const handleFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target && typeof event.target.result === 'string') {
                    setImage({
                        name: file.name,
                        mimeType: file.type,
                        data: event.target.result.split(',')[1],
                    });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const clearFile = () => {
        setImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (prompt.trim() && !isGeneratingFurnitechVideo) {
            generateFurnitechVideo({ prompt, image });
        }
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-film"></i>
                    <h2 class="card-title">Furnitech Video Studio</h2>
                </div>
            </div>
            <p class="furnitech-feature-intro">
                Bring your ideas to life with Furnitech-powered video. Describe a scene, or provide an image as a starting point, and watch it animate.
            </p>
            <form class="furnitech-video-studio-form" onSubmit=${handleSubmit}>
                <div class="form-group-planner">
                    <i class="fa-solid fa-lightbulb" style=${{top: '1.2rem', transform: 'none'}}></i>
                    <textarea
                        value=${prompt}
                        onInput=${e => setPrompt(e.target.value)}
                        placeholder="e.g., 'A neon hologram of a cat driving at top speed'"
                        rows="3"
                        style=${{paddingLeft: '3rem'}}
                        required
                    ></textarea>
                </div>
                <div class="file-upload-wrapper">
                    <input type="file" id="video-image-upload" accept="image/*" onChange=${handleFileChange} ref=${fileInputRef} />
                    <label for="video-image-upload" class="btn">
                        <i class="fa-solid fa-image"></i> Add Image (Optional)
                    </label>
                    ${image && html`
                        <div class="file-name-display">
                           <i class="fa-solid fa-file-image"></i>
                           <span class="file-name-text">${image.name}</span>
                           <button type="button" class="btn-clear-file" onClick=${clearFile} aria-label="Remove file">×</button>
                        </div>
                    `}
                </div>
                 <div class="furnitech-feature-actions">
                     <button type="submit" class="btn btn-primary" disabled=${isGeneratingFurnitechVideo || !prompt.trim()}>
                        ${isGeneratingFurnitechVideo ? html`<div class="loading-spinner"></div> Generating...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Video`}
                    </button>
                </div>
            </form>
            
            ${isGeneratingFurnitechVideo && html`
                <div class="loading-indicator-box">
                    <div class="loading-spinner-dark"></div>
                    <p>${furnitechVideoGenerationStatus}</p>
                </div>
            `}
            ${furnitechVideoGenerationError && html`<div class="furnitech-error">${furnitechVideoGenerationError}</div>`}

            ${generatedFurnitechVideoUrl && html`
                <div class="generated-video-wrapper">
                    <video src=${generatedFurnitechVideoUrl} controls autoplay loop muted playsinline>
                        Your browser does not support the video tag.
                    </video>
                    <a href=${generatedFurnitechVideoUrl} download="obra-generated-video.mp4" class="btn btn-primary btn-download-video">
                         <i class="fa-solid fa-download"></i> Download Video
                    </a>
                </div>
            `}
        </div>
    `;
}


function BundleCard({ bundle }) {
    const { currency, setCart } = useContext(AppContext);

    const totalCost = useMemo(() => {
        return bundle.items.reduce((sum, item) => {
            const product = initialProducts.find(p => p.code === item.code);
            return sum + (product ? Number(product.price) * item.quantity : 0);
        }, 0);
    }, [bundle, initialProducts]);

    const addBundleToCart = () => {
        setCart(prevCart => {
            const newCart = [...prevCart];
            bundle.items.forEach(bundleItem => {
                const product = initialProducts.find(p => p.code === bundleItem.code);
                if (product) {
                    const selectedColor = product.colors ? product.colors[0] : null;
                    const cartId = product.code + (selectedColor ? `-${selectedColor.name}` : '');
                    const existingItemIndex = newCart.findIndex(cartItem => cartItem.cartId === cartId);
                    if (existingItemIndex > -1) {
                        newCart[existingItemIndex].quantity += bundleItem.quantity;
                    } else {
                        newCart.push({ ...product, quantity: bundleItem.quantity, selectedColor, cartId });
                    }
                }
            });
            return newCart;
        });
    };

    return html`
        <div class="bundle-card">
            <div class="bundle-info">
                <h3 class="bundle-name">${bundle.name}</h3>
                <p class="bundle-description">${bundle.description}</p>
                <ul class="bundle-item-list">
                    ${bundle.items.map(item => {
                        const product = initialProducts.find(p => p.code === item.code);
                        return product ? html`<li key=${item.code}><span>${item.quantity}x</span> ${product.name}</li>` : null;
                    })}
                </ul>
            </div>
            <div class="bundle-footer">
                <div class="bundle-price">
                    <span>Bundle Price</span>
                    <strong>${formatCurrency(totalCost, currency)}</strong>
                </div>
                <button onClick=${addBundleToCart} class="btn btn-primary">
                    <i class="fa-solid fa-box-open"></i> Add Bundle to Quote
                </button>
            </div>
        </div>
    `;
}


function ProductBundles() {
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-boxes-packing"></i>
                    <h2 class="card-title">Product Bundles</h2>
                </div>
            </div>
            <p class="furnitech-feature-intro">
                Get started quickly with our curated furniture packages. Add a complete setup to your quote with just one click.
            </p>
            <div class="product-bundles-grid">
                ${productBundles.map(bundle => html`
                    <${BundleCard} key=${bundle.id} bundle=${bundle} />
                `)}
            </div>
        </div>
    `;
}

function CallToActionBanner() {
    return html`
        <div class="cta-banner">
            <div class="cta-content">
                <h2>Ready to Build Your Perfect Office?</h2>
                <p>Get a comprehensive, no-obligation quotation in minutes.</p>
                <button class="btn btn-cta" onClick=${() => {
                    const aside = document.querySelector('aside');
                    if (aside) {
                        aside.scrollIntoView({ behavior: 'smooth' });
                    }
                 }}>
                    Start Your Free Quote Now <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;
}

function ProductGrid() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [sortOrder, setSortOrder] = useState('default');
    const [selectedPriceRanges, setSelectedPriceRanges] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isGeneratingCatalog, setIsGeneratingCatalog] = useState(false);
    const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
    const { currency } = useContext(AppContext);

    const categories = useMemo(() => [...new Set(initialProducts.map(p => p.category))], []);

    const priceRanges = {
        'Under ₱10,000': [0, 9999.99],
        '₱10,000 - ₱20,000': [10000, 20000],
        'Over ₱20,000': [20000.01, Infinity],
    };

    const fuse = useMemo(() => new Fuse(initialProducts, {
        keys: ['name', 'code', 'category', 'description'],
        threshold: 0.3,
        minMatchCharLength: 2,
        ignoreLocation: true,
    }), [initialProducts]);

    const filteredAndSortedProducts = useMemo(() => {
        let products = initialProducts;

        if (searchQuery) {
            products = fuse.search(searchQuery).map(result => result.item);
        }

        if (selectedCategories.length > 0) {
            products = products.filter(p => selectedCategories.includes(p.category));
        }
        
        if (selectedPriceRanges.length > 0) {
            products = products.filter(p => {
                const price = Number(p.price);
                return selectedPriceRanges.some(range => {
                    const [min, max] = priceRanges[range];
                    return price >= min && price <= max;
                });
            });
        }

        const sorted = [...products];
        switch (sortOrder) {
            case 'price-asc':
                sorted.sort((a, b) => Number(a.price) - Number(b.price));
                break;
            case 'price-desc':
                sorted.sort((a, b) => Number(b.price) - Number(a.price));
                break;
            case 'name-asc':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }

        return sorted;
    }, [searchQuery, selectedCategories, sortOrder, selectedPriceRanges, fuse]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query) {
            setSuggestions(fuse.search(query).slice(0, 5).map(result => result.item));
        } else {
            setSuggestions([]);
        }
    };
    
    const handleSuggestionClick = (productName) => {
        setSearchQuery(productName);
        setSuggestions([]);
    };
    
    const clearFilters = () => {
        setSearchQuery('');
        setSelectedCategories([]);
        setSelectedPriceRanges([]);
        setSortOrder('default');
    };

    const handleCategoryToggle = (category) => {
        setSelectedCategories(prev => 
            prev.includes(category) 
            ? prev.filter(c => c !== category)
            : [...prev, category]
        );
    };

    const handlePriceRangeToggle = (range) => {
        setSelectedPriceRanges(prev => 
            prev.includes(range)
            ? prev.filter(r => r !== range)
            : [...prev, range]
        );
    };

    const generateCatalogPdf = async () => {
        setIsGeneratingCatalog(true);
        try {
            const pngLogo = await convertSvgToPng(`data:image/svg+xml;base64,${obraLogo}`);
            const doc = new jsPDF();

            // Header
            doc.addImage(pngLogo, 'PNG', 14, 12, 60, 20);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text("Product Catalog", 196, 20, { align: 'right' });

            // Table
            const head = [['SKU', 'Product Name', 'Category', 'Dimensions', 'Price']];
            const body = initialProducts.map(item => ([
                item.code,
                item.name,
                item.category,
                item.dimensions,
                formatCurrency(item.price, currency)
            ]));

            autoTable(doc, {
                head,
                body,
                startY: 40,
                theme: 'striped',
                headStyles: { fillColor: [22, 22, 22] },
            });

            // Footer
            const pageHeight = doc.internal.pageSize.getHeight();
            const footerY = pageHeight - 20;
            doc.setLineWidth(0.2);
            doc.line(14, footerY, 196, footerY);
            doc.setFontSize(8);
            doc.text("OBRA Office Furniture | obrafurniture@gmail.com | +63 915 743 9188 | facebook.com/obraofficefurniture", 105, footerY + 8, { align: 'center' });
            doc.text(`Catalog generated on: ${new Date().toLocaleDateString('en-US')}`, 105, footerY + 12, { align: 'center' });

            doc.save(`OBRA-Product-Catalog-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("Failed to generate catalog PDF", error);
        } finally {
            setIsGeneratingCatalog(false);
        }
    };

    return html`
        <div class="card product-grid-card">
            <${CallToActionBanner} />
            <div class="product-grid-header">
                <div class="card-title-wrapper">
                    <div class="card-title-main">
                        <i class="fa-solid fa-store"></i>
                        <h2 class="card-title">Product Catalog</h2>
                    </div>
                    <button onClick=${generateCatalogPdf} disabled=${isGeneratingCatalog} class="btn">
                        ${isGeneratingCatalog ? html`<div class="loading-spinner-dark"></div>` : html`<i class="fa-solid fa-file-pdf"></i>`} Download Catalog
                    </button>
                </div>
                <div class="search-and-filter-wrapper">
                    <div class="search-bar" onFocus=${() => setIsSearchFocused(true)} onBlur=${() => setTimeout(() => setIsSearchFocused(false), 100)}>
                         <i class="fa-solid fa-search"></i>
                         <input
                            type="text"
                            placeholder="Search for products..."
                            value=${searchQuery}
                            onInput=${handleSearchChange}
                            aria-label="Search products"
                          />
                          ${isSearchFocused && suggestions.length > 0 && html`
                            <div class="autocomplete-suggestions">
                                ${suggestions.map(item => html`
                                    <div class="suggestion-item" onClick=${() => handleSuggestionClick(item.name)}>
                                        ${item.name}
                                    </div>
                                `)}
                            </div>
                          `}
                    </div>
                    <button class="btn btn-secondary btn-filter" onClick=${() => setIsFilterPanelOpen(prev => !prev)}>
                        <i class="fa-solid fa-filter"></i>
                        <span>Filters</span>
                    </button>
                </div>
            </div>
            ${isFilterPanelOpen && html`
                <div class="filter-panel">
                    <div class="filter-section">
                        <h4 class="filter-title">Category</h4>
                        <div class="filter-options">
                             <button
                                class="filter-option-btn ${selectedCategories.length === 0 ? 'active' : ''}"
                                onClick=${() => setSelectedCategories([])}
                            >All</button>
                            ${categories.map(cat => html`
                                <button
                                    key=${cat}
                                    class="filter-option-btn ${selectedCategories.includes(cat) ? 'active' : ''}"
                                    onClick=${() => handleCategoryToggle(cat)}
                                >${cat}</button>
                            `)}
                        </div>
                    </div>
                    <div class="filter-section">
                        <h4 class="filter-title">Price Range</h4>
                        <div class="filter-options">
                            <button
                                class="filter-option-btn ${selectedPriceRanges.length === 0 ? 'active' : ''}"
                                onClick=${() => setSelectedPriceRanges([])}
                            >All</button>
                            ${Object.keys(priceRanges).map(range => html`
                                <button
                                    key=${range}
                                    class="filter-option-btn ${selectedPriceRanges.includes(range) ? 'active' : ''}"
                                    onClick=${() => handlePriceRangeToggle(range)}
                                >${range}</button>
                            `)}
                        </div>
                    </div>
                    <div class="filter-section">
                        <h4 class="filter-title">Sort By</h4>
                        <div class="filter-group">
                             <i class="fa-solid fa-arrow-down-wide-short"></i>
                             <select value=${sortOrder} onChange=${e => setSortOrder(e.target.value)} aria-label="Sort products">
                                <option value="default">Default</option>
                                <option value="price-asc">Price: Low to High</option>
                                <option value="price-desc">Price: High to Low</option>
                                <option value="name-asc">Name: A-Z</option>
                             </select>
                        </div>
                    </div>
                     <div class="filter-panel-footer">
                        <button class="btn-link" onClick=${clearFilters}>Clear All Filters</button>
                    </div>
                </div>
            `}
            ${filteredAndSortedProducts.length > 0 ? html`
                <div class="product-grid">
                    ${filteredAndSortedProducts.map(product => html`<${ProductCard} key=${product.code} product=${product} />`)}
                </div>
            ` : html`
                <div class="no-results">
                    <p>No products found matching your criteria.</p>
                </div>
            `}
        </div>
    `;
}

function ClientInfoForm() {
    const { clientInfo, setClientInfo } = useContext(AppContext);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setClientInfo(prev => ({ ...prev, [name]: value }));
    };
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <i class="fa-solid fa-user-tie"></i>
                <h2 class="card-title">Client Information</h2>
            </div>
            <div class="client-info-form">
                <div class="form-group">
                    <label for="name">Client Name</label>
                    <input type="text" name="name" id="name" value=${clientInfo.name} onInput=${handleChange} placeholder="e.g., Juan Dela Cruz" />
                </div>
                <div class="form-group">
                    <label for="company">Company Name</label>
                    <input type="text" name="company" id="company" value=${clientInfo.company} onInput=${handleChange} placeholder="e.g., OBRA Inc." />
                </div>
                <div class="form-group">
                    <label for="contact">Contact Number</label>
                    <input type="tel" name="contact" id="contact" value=${clientInfo.contact} onInput=${handleChange} placeholder="e.g., +63 917 123 4567" />
                </div>
                 <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" name="email" id="email" value=${clientInfo.email} onInput=${handleChange} placeholder="e.g., juan.delacruz@obra.com" />
                </div>
            </div>
        </div>
    `;
}

// A generic Modal component
function Modal({ children, onClose, title, customClass = '' }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return html`
        <div class="modal-overlay" onClick=${onClose}>
            <div class="modal-content ${customClass}" onClick=${e => e.stopPropagation()}>
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                    <button class="modal-close-btn" onClick=${onClose} aria-label="Close modal">×</button>
                </div>
                <div class="modal-body">
                    ${children}
                </div>
            </div>
        </div>
    `;
}

// Specific modal for website previews
function WebsitePreviewModal({ url, onClose }) {
    if (!url) return null;
    
    let displayTitle = 'Website Preview';
    try {
        const urlObject = new URL(url);
        displayTitle = urlObject.hostname;
    } catch (e) {
        console.error("Invalid URL for preview modal:", url);
    }

    return html`
        <${Modal} onClose=${onClose} title=${displayTitle} customClass="modal-content-website">
            <iframe
                src=${url}
                title="Website Preview"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                referrerpolicy="no-referrer"
            ></iframe>
        <//>
    `;
}


function ProductMention({ productCode }) {
    const { setCart, currency } = useContext(AppContext);
    const product = initialProducts.find(p => p.code === productCode);

    if (!product) {
        return html`<span class="product-mention-invalid">Invalid SKU: ${productCode}</span>`;
    }

    const addToCart = () => {
        setCart(prevCart => {
            const selectedColor = product.colors ? product.colors[0] : null;
            const cartId = product.code + (selectedColor ? `-${selectedColor.name}` : '');
            const existingItem = prevCart.find(item => item.cartId === cartId);
            if (existingItem) {
                return prevCart.map(item =>
                    item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1, selectedColor, cartId }];
        });
    };

    return html`
        <div class="product-mention">
            <div class="mention-info">
                <p class="mention-name">${product.name}</p>
                <p class="mention-price">${formatCurrency(product.price, currency)}</p>
            </div>
            <button onClick=${addToCart} class="btn-mention-add" aria-label=${`Add ${product.name} to cart`}>
                <i class="fa-solid fa-plus"></i> Add to Quote
            </button>
        </div>
    `;
}

function FormattedFurnitechResponse({ text, groundingChunks }) {
    const { setModalUrl } = useContext(AppContext);
    
    const content = useMemo(() => {
        const skuRegex = /(\[SKU:[^\]]+\])/g;
        const parts = text.split(skuRegex);

        return parts.map(part => {
            if (!part) return null;

            const skuMatch = part.match(/\[SKU:([^\]]+)\]/);
            if (skuMatch) {
                const productCode = skuMatch[1];
                return html`<${ProductMention} productCode=${productCode} />`;
            }

            const formatted = part
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            const blocks = formatted.split(/\n\s*\n/);

            return blocks.map(block => {
                if (block.match(/^(\s*[\-\*]\s.*)+$/s)) {
                    const items = block.split('\n').map(item => {
                        const content = item.replace(/^\s*[\-\*]\s/, '');
                        if (!content) return null;
                        return html`<li dangerouslySetInnerHTML=${{__html: content}}></li>`;
                    }).filter(Boolean);
                    return html`<ul>${items}</ul>`;
                }
                if (block.trim()) {
                    return html`<p dangerouslySetInnerHTML=${{__html: block.replace(/\n/g, '<br />')}}></p>`;
                }
                return null;
            }).filter(Boolean);
        });
    }, [text]);

    return html`
        <div class="formatted-furnitech-content">
            ${content}
            ${groundingChunks && groundingChunks.length > 0 && html`
                <div class="grounding-sources">
                    <h4 class="sources-title">
                        <i class="fa-solid fa-globe"></i>
                        Sources from the web
                    </h4>
                    <ul class="sources-list">
                        ${groundingChunks.map(chunk => chunk.web && html`
                            <li key=${chunk.web.uri}>
                                <a href=${chunk.web.uri} onClick=${(e) => { e.preventDefault(); setModalUrl(chunk.web.uri); }} rel="noopener noreferrer" data-tooltip="Open Preview">
                                    ${chunk.web.title || chunk.web.uri}
                                </a>
                            </li>
                        `)}
                    </ul>
                </div>
            `}
        </div>
    `;
}

function FurnitechAssistant() {
    const {
        furnitechAssistantHistory,
        isFurnitechAssistantGenerating,
        furnitechAssistantError,
        generateFurnitechResponse,
        chatSummary,
        setChatSummary,
        isSummarizing,
        summarizeChat,
    } = useContext(AppContext);

    const [prompt, setPrompt] = useState('');
    const [useWebSearch, setUseWebSearch] = useState(false);
    const historyRef = useRef(null);

    useEffect(() => {
        if (historyRef.current) {
            historyRef.current.scrollTop = historyRef.current.scrollHeight;
        }
    }, [furnitechAssistantHistory]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (prompt.trim() && !isFurnitechAssistantGenerating) {
            generateFurnitechResponse(prompt, useWebSearch);
            setPrompt('');
            setUseWebSearch(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                 <div class="card-title-main">
                    <i class="fa-solid fa-comments-dollar"></i>
                    <h2 class="card-title">Furnitech Assistant</h2>
                </div>
                <button
                    onClick=${summarizeChat}
                    disabled=${isSummarizing || furnitechAssistantHistory.length === 0}
                    class="btn btn-secondary"
                    data-tooltip="Summarize Conversation"
                >
                   ${isSummarizing ? html`<div class="loading-spinner-small"></div>` : html`<i class="fa-solid fa-file-lines"></i>`}
                </button>
            </div>
            ${chatSummary && html`
                <div class="chat-summary-container">
                    <div class="summary-header">
                        <h4><i class="fa-solid fa-list-check"></i> Chat Summary</h4>
                        <button class="btn-clear-summary" onClick=${() => setChatSummary(null)} aria-label="Close summary">×</button>
                    </div>
                    <div class="summary-content">
                         <${FormattedFurnitechResponse} text=${chatSummary} />
                    </div>
                </div>
            `}
            <p class="furnitech-feature-intro">
                Ask for product recommendations or design ideas. For current trends, enable "Search Web" for the latest insights.
            </p>
            <div class="furnitech-assistant-history" ref=${historyRef}>
                ${furnitechAssistantHistory.length === 0 && html`
                    <div class="empty-chat">
                        <i class="fa-solid fa-robot"></i>
                        <p>Ready to help you build the perfect office!</p>
                    </div>
                `}
                ${furnitechAssistantHistory.map((msg, index) => html`
                    <div key=${index} class="chat-message ${msg.role}">
                        <div class="message-bubble">
                            ${msg.role === 'model' ? html`<${FormattedFurnitechResponse} text=${msg.content} groundingChunks=${msg.groundingChunks} />` : msg.content}
                        </div>
                    </div>
                `)}
                ${isFurnitechAssistantGenerating && html`
                    <div class="chat-message model">
                        <div class="message-bubble">
                            <div class="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                `}
            </div>
            ${furnitechAssistantError && html`<p class="furnitech-error-inline">${furnitechAssistantError}</p>`}
            <form class="furnitech-assistant-form" onSubmit=${handleSubmit}>
                 <div class="textarea-wrapper">
                    <textarea
                        value=${prompt}
                        onInput=${e => setPrompt(e.target.value)}
                        placeholder="e.g., 'What are the latest trends in office design?'"
                        rows="2"
                        aria-label="Ask the Furnitech assistant"
                        onKeyDown=${handleKeyDown}
                    ></textarea>
                    <div class="web-search-toggle">
                        <input 
                            type="checkbox" 
                            id="web-search-checkbox" 
                            checked=${useWebSearch} 
                            onChange=${() => setUseWebSearch(!useWebSearch)} 
                        />
                        <label for="web-search-checkbox">
                            <i class="fa-solid fa-globe"></i> Search Web
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" disabled=${isFurnitechAssistantGenerating || !prompt.trim()}>
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    `;
}

function Wishlist() {
    const { wishlist, setWishlist, setCart, currency } = useContext(AppContext);

    const removeItem = (code) => {
        setWishlist(prev => prev.filter(itemCode => itemCode !== code));
    };

    const moveToCart = (code) => {
        const product = initialProducts.find(p => p.code === code);
        if (product) {
            setCart(prevCart => {
                const selectedColor = product.colors ? product.colors[0] : null;
                const cartId = product.code + (selectedColor ? `-${selectedColor.name}` : '');
                const existingItem = prevCart.find(item => item.cartId === cartId);
                if (existingItem) {
                    return prevCart.map(item =>
                        item.cartId === cartId ? { ...item, quantity: item.quantity + 1 } : item
                    );
                }
                return [...prevCart, { ...product, quantity: 1, selectedColor, cartId }];
            });
            removeItem(code); // remove from wishlist after adding to cart
        }
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-heart"></i>
                    <h2 class="card-title">Wishlist</h2>
                </div>
                ${wishlist.length > 0 && html`<span class="wishlist-count">${wishlist.length}</span>`}
            </div>

            ${wishlist.length === 0 ? html`
                <div class="empty-wishlist">
                    <i class="fa-solid fa-heart-crack"></i>
                    <p>Your wishlist is empty.<br/>Add items you love from the catalog.</p>
                </div>
            ` : html`
                <div class="wishlist-items">
                    ${wishlist.map(code => {
                        const product = initialProducts.find(p => p.code === code);
                        if (!product) return null;
                        return html`
                            <div class="wishlist-item" key=${code}>
                                <div class="wishlist-item-details">
                                    <p class="item-name">${product.name}</p>
                                    <p class="item-price">${formatCurrency(product.price, currency)}</p>
                                </div>
                                <div class="wishlist-item-controls">
                                    <button class="btn-icon" onClick=${() => moveToCart(code)} aria-label="Move to Quote" data-tooltip="Move to Quote">
                                        <i class="fa-solid fa-cart-arrow-down"></i>
                                    </button>
                                    <button class="btn-icon btn-delete" onClick=${() => removeItem(code)} aria-label="Remove from Wishlist" data-tooltip="Remove">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            `}
        </div>
    `;
}

function QuotationPreviewModal({ onClose, cart, clientInfo, currency, subtotal, discountAmount, deliveryFee, total }) {
    const quoteDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(quoteDate.getDate() + 30);
    
    return html`
        <${Modal} onClose=${onClose} title="Quotation Preview" customClass="modal-content-preview">
            <div class="quotation-preview-content">
                <div class="preview-header">
                    <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Logo" />
                    <h1>QUOTATION</h1>
                </div>
                <div class="preview-info">
                    <div class="info-block">
                        <strong>Bill To:</strong>
                        <p>${clientInfo.name || 'N/A'}</p>
                        <p>${clientInfo.company || 'N/A'}</p>
                        <p>${clientInfo.contact || 'N/A'}</p>
                        <p>${clientInfo.email || 'N/A'}</p>
                    </div>
                    <div class="info-block align-right">
                        <p><strong>Quotation #:</strong> OBRA-${quoteDate.getFullYear()}-${(quoteDate.getMonth() + 1).toString().padStart(2, '0')}${quoteDate.getDate().toString().padStart(2, '0')}</p>
                        <p><strong>Date:</strong> ${quoteDate.toLocaleDateString('en-US')}</p>
                        <p><strong>Valid Until:</strong> ${expiryDate.toLocaleDateString('en-US')}</p>
                    </div>
                </div>
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>Product Name</th>
                            <th class="align-right">Qty</th>
                            <th class="align-right">Unit Price</th>
                            <th class="align-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cart.map(item => html`
                            <tr key=${item.cartId}>
                                <td>${item.code}</td>
                                <td>${item.selectedColor ? `${item.name} (${item.selectedColor.name})` : item.name}</td>
                                <td class="align-right">${item.quantity}</td>
                                <td class="align-right">${formatCurrency(item.price, currency)}</td>
                                <td class="align-right">${formatCurrency(Number(item.price) * item.quantity, currency)}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
                 <div class="preview-totals">
                    <div class="total-line">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal, currency)}</span>
                    </div>
                    ${discountAmount > 0 && html`
                        <div class="total-line">
                            <span>Discount</span>
                            <span>- ${formatCurrency(discountAmount, currency)}</span>
                        </div>
                    `}
                    ${deliveryFee > 0 && html`
                        <div class="total-line">
                            <span>Delivery Fee</span>
                            <span>${formatCurrency(deliveryFee, currency)}</span>
                        </div>
                    `}
                    <div class="total-line grand-total">
                        <span>TOTAL</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                </div>
                <div class="preview-footer">
                     <p>OBRA Office Furniture | obrafurniture@gmail.com | +63 915 743 9188</p>
                     <p>Thank you for your business!</p>
                </div>
            </div>
        <//>
    `;
}

function Quotation() {
    const { cart, setCart, clientInfo, currency, setCurrency } = useContext(AppContext);
    
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [discount, setDiscount] =useState(0);
    const [discountType, setDiscountType] = useState('percent'); // 'percent' or 'fixed'
    const [showPreview, setShowPreview] = useState(false);

    const updateQuantity = (cartId, delta) => {
        setCart(prevCart => {
            const updatedCart = prevCart.map(item =>
                item.cartId === cartId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
            );
            return updatedCart.filter(item => item.quantity > 0);
        });
    };

    const removeItem = (cartId) => {
        setCart(prevCart => prevCart.filter(item => item.cartId !== cartId));
    };

    const subtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
    }, [cart]);

    const discountAmount = useMemo(() => {
        if (discountType === 'percent') {
            return subtotal * (discount / 100);
        }
        return Math.min(subtotal, discount); // Cannot discount more than subtotal
    }, [subtotal, discount, discountType]);

    const total = useMemo(() => {
        return subtotal - discountAmount + Number(deliveryFee);
    }, [subtotal, discountAmount, deliveryFee]);

    const generatePdf = async () => {
        if (!clientInfo.name || !clientInfo.company) {
            alert("Please fill in the Client Name and Company Name before generating a quotation.");
            return;
        }

        try {
            const pngLogo = await convertSvgToPng(`data:image/svg+xml;base64,${obraLogo}`);
            const doc = new jsPDF();
            const pageHeight = doc.internal.pageSize.getHeight();
            const pageWidth = doc.internal.pageSize.getWidth();

            // Header
            doc.addImage(pngLogo, 'PNG', 14, 12, 60, 20);
            doc.setFontSize(22);
            doc.setFont( 'helvetica', 'bold');
            doc.text("QUOTATION", pageWidth - 14, 20, { align: 'right' });

            // Client Info and Dates
            doc.setLineWidth(0.5);
            doc.line(14, 40, pageWidth - 14, 40);
            const quoteDate = new Date();
            const expiryDate = new Date();
            expiryDate.setDate(quoteDate.getDate() + 30);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text("Bill To:", 14, 48);
            doc.setFont('helvetica', 'normal');
            doc.text(clientInfo.name, 14, 53);
            doc.text(clientInfo.company, 14, 58);
            doc.text(clientInfo.contact, 14, 63);
            doc.text(clientInfo.email, 14, 68);

            doc.setFont('helvetica', 'bold');
            doc.text("Quotation #:", pageWidth - 55, 48);
            doc.text("Date:", pageWidth - 55, 53);
            doc.text("Valid Until:", pageWidth - 55, 58);
            doc.setFont('helvetica', 'normal');
            doc.text(`OBRA-${quoteDate.getFullYear()}-${(quoteDate.getMonth() + 1).toString().padStart(2, '0')}${quoteDate.getDate().toString().padStart(2, '0')}`, pageWidth - 14, 48, { align: 'right' });
            doc.text(quoteDate.toLocaleDateString('en-US'), pageWidth - 14, 53, { align: 'right' });
            doc.text(expiryDate.toLocaleDateString('en-US'), pageWidth - 14, 58, { align: 'right' });

            // Items Table
            const head = [['SKU', 'Product Name', 'Dimensions', 'Qty', 'Unit Price', 'Total']];
            const body = cart.map(item => ([
                item.code,
                item.selectedColor ? `${item.name} (${item.selectedColor.name})` : item.name,
                item.dimensions,
                item.quantity,
                formatCurrency(item.price, currency),
                formatCurrency(Number(item.price) * item.quantity, currency)
            ]));

            autoTable(doc, {
                head,
                body,
                startY: 80,
                theme: 'striped',
                headStyles: { fillColor: [22, 22, 22] },
                didDrawPage: (data) => {
                    // Footer
                    const footerY = pageHeight - 25;
                    doc.setLineWidth(0.2);
                    doc.line(14, footerY, pageWidth - 14, footerY);
                    doc.setFontSize(8);
                    doc.text("OBRA Office Furniture | obrafurniture@gmail.com | +63 915 743 9188", pageWidth / 2, footerY + 8, { align: 'center' });
                    doc.text("Thank you for your business!", pageWidth / 2, footerY + 12, { align: 'center' });
                }
            });

            // Totals Section
            let finalY = (doc as any).lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');

            const addTotalLine = (label, value) => {
                 if (finalY > pageHeight - 35) {
                    doc.addPage();
                    finalY = 20;
                 }
                 doc.text(label, pageWidth - 60, finalY);
                 doc.setFont('helvetica', 'normal');
                 doc.text(value, pageWidth - 14, finalY, { align: 'right' });
                 doc.setFont('helvetica', 'bold');
                 finalY += 7;
            };
            
            addTotalLine("Subtotal:", formatCurrency(subtotal, currency));
            if(discountAmount > 0) addTotalLine("Discount:", `- ${formatCurrency(discountAmount, currency)}`);
            if(deliveryFee > 0) addTotalLine("Delivery Fee:", formatCurrency(deliveryFee, currency));

            doc.setLineWidth(0.3);
            doc.line(pageWidth - 60, finalY - 2, pageWidth - 14, finalY - 2);
            doc.setFontSize(14);
            addTotalLine("TOTAL:", formatCurrency(total, currency));

            doc.save(`Quotation-${clientInfo.company || 'Client'}-${quoteDate.toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error("Failed to generate PDF", error);
            alert("An error occurred while generating the PDF. Please check the console for details.");
        }
    };
    
    const handlePrint = useCallback(() => {
        if (cart.length === 0) return;
        if (!clientInfo.name || !clientInfo.company) {
            alert("Please fill in the Client Name and Company Name before printing.");
            return;
        }

        const printWindow = window.open('', '_blank');

        const cartItemsHtml = cart.map(item => `
            <tr>
                <td>${item.code}</td>
                <td>${item.selectedColor ? `${item.name} (${item.selectedColor.name})` : item.name}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: right;">${formatCurrency(item.price, currency)}</td>
                <td style="text-align: right;">${formatCurrency(Number(item.price) * item.quantity, currency)}</td>
            </tr>
        `).join('');

        const printContent = `
            <html>
                <head>
                    <title>Quotation - OBRA Office Furniture</title>
                    <style>
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 1.5cm; color: #333; }
                        .preview-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 1rem; margin-bottom: 1.5rem; border-bottom: 2px solid #eee; }
                        .preview-header img { height: 45px; }
                        .preview-header h1 { font-size: 2.2rem; margin: 0; color: #111; }
                        .preview-info { display: flex; justify-content: space-between; margin-bottom: 2rem; font-size: 0.9rem; }
                        .info-block p { margin: 4px 0; }
                        .info-block.align-right { text-align: right; }
                        .preview-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
                        .preview-table th, .preview-table td { border: 1px solid #ddd; padding: 12px; text-align: left; font-size: 0.9rem; }
                        .preview-table th { background-color: #f2f2f2; font-weight: bold; }
                        .preview-table .align-right { text-align: right; }
                        .preview-table .align-center { text-align: center; }
                        .preview-totals { display: flex; justify-content: flex-end; }
                        .totals-table { width: 100%; max-width: 350px; }
                        .totals-table td { padding: 8px 0; }
                        .totals-table .label { text-align: right; padding-right: 1.5rem; color: #555; }
                        .totals-table .value { text-align: right; font-weight: bold; }
                        .totals-table .grand-total td { border-top: 2px solid #333; padding-top: 10px; font-size: 1.2rem; }
                        .preview-footer { text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.85rem; color: #777; }
                    </style>
                </head>
                <body>
                    <div class="preview-header">
                        <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Logo" />
                        <h1>QUOTATION</h1>
                    </div>
                    <div class="preview-info">
                        <div class="info-block">
                            <p><strong>Bill To:</strong></p>
                            <p>${clientInfo.name || 'N/A'}</p>
                            <p>${clientInfo.company || 'N/A'}</p>
                            <p>${clientInfo.contact || 'N/A'}</p>
                            <p>${clientInfo.email || 'N/A'}</p>
                        </div>
                        <div class="info-block align-right">
                            <p><strong>Quotation #:</strong> OBRA-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}</p>
                            <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US')}</p>
                        </div>
                    </div>
                    <table class="preview-table">
                        <thead>
                            <tr>
                                <th>SKU</th>
                                <th>Product Name</th>
                                <th class="align-center">Qty</th>
                                <th class="align-right">Unit Price</th>
                                <th class="align-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cartItemsHtml}
                        </tbody>
                    </table>
                     <div class="preview-totals">
                        <table class="totals-table">
                            <tr><td class="label">Subtotal</td><td class="value">${formatCurrency(subtotal, currency)}</td></tr>
                            ${discountAmount > 0 ? `<tr><td class="label">Discount</td><td class="value">- ${formatCurrency(discountAmount, currency)}</td></tr>` : ''}
                            ${deliveryFee > 0 ? `<tr><td class="label">Delivery Fee</td><td class="value">${formatCurrency(deliveryFee, currency)}</td></tr>` : ''}
                            <tr class="grand-total"><td class="label"><strong>TOTAL</strong></td><td class="value"><strong>${formatCurrency(total, currency)}</strong></td></tr>
                        </table>
                    </div>
                    <div class="preview-footer">
                         <p>OBRA Office Furniture | obrafurniture@gmail.com | +63 915 743 9188</p>
                         <p>Thank you for your business!</p>
                    </div>
                </body>
            </html>
        `;

        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.focus();
            // Delay print to ensure images and styles are loaded
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 250);
        }
    }, [cart, clientInfo, currency, subtotal, discountAmount, deliveryFee, total]);

    return html`
        <div class="card quotation">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Logo" class="quotation-logo" />
                    <h2 class="card-title">Quotation</h2>
                </div>
                 <div class="currency-selector">
                    <i class="fa-solid fa-coins"></i>
                    <select value=${currency} onChange=${e => setCurrency(e.target.value)}>
                        ${Object.keys(currencyRates).map(c => html`<option value=${c}>${c}</option>`)}
                    </select>
                </div>
            </div>

            ${cart.length === 0 ? html`
                <div class="empty-cart">
                    <i class="fa-solid fa-cart-shopping"></i>
                    <p>Your quotation is empty.<br/>Add products from the catalog to get started.</p>
                </div>
            ` : html`
                <div class="cart-items">
                    ${cart.map(item => html`
                        <div class="cart-item" key=${item.cartId}>
                            <div class="item-details">
                                <p class="item-name">${item.name} ${item.selectedColor && html`<span class="item-color">(${item.selectedColor.name})</span>`}</p>
                                <p class="item-price">${formatCurrency(item.price, currency)}</p>
                            </div>
                            <div class="item-controls">
                                <button class="btn-quantity" onClick=${() => updateQuantity(item.cartId, -1)} aria-label="Decrease quantity">-</button>
                                <span class="item-quantity">${item.quantity}</span>
                                <button class="btn-quantity" onClick=${() => updateQuantity(item.cartId, 1)} aria-label="Increase quantity">+</button>
                                <button class="btn-delete" onClick=${() => removeItem(item.cartId)} aria-label="Remove item" data-tooltip="Remove">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    `)}
                </div>

                <div class="summary-divider"></div>

                <div class="summary-extras">
                    <div class="summary-line-item-input">
                        <span>Discount</span>
                        <div class="input-group">
                            <input type="number" value=${discount} onInput=${e => setDiscount(Math.max(0, e.target.value))} />
                             <div class="discount-toggle">
                                <button 
                                    class="toggle-btn ${discountType === 'percent' ? 'active' : ''}" 
                                    onClick=${() => setDiscountType('percent')}>%</button>
                                <button 
                                    class="toggle-btn ${discountType === 'fixed' ? 'active' : ''}" 
                                    onClick=${() => setDiscountType('fixed')}>${currencyRates[currency].symbol}</button>
                             </div>
                        </div>
                    </div>
                     <div class="summary-line-item-input">
                        <span>Delivery Fee</span>
                        <div class="delivery-fee-group">
                            <span>${currencyRates[currency].symbol}</span>
                            <input type="number" value=${deliveryFee} onInput=${e => setDeliveryFee(Math.max(0, e.target.value))} />
                        </div>
                    </div>
                </div>

                <div class="summary-divider"></div>

                <div class="summary-total">
                    <div class="summary-line-item">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal, currency)}</span>
                    </div>
                     ${discountAmount > 0 && html`
                        <div class="summary-line-item">
                            <span>Discount</span>
                            <span>- ${formatCurrency(discountAmount, currency)}</span>
                        </div>
                    `}
                    <div class="summary-line-item">
                        <span>Grand Total</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                </div>

                <div class="actions">
                    <button onClick=${() => setShowPreview(true)} class="btn">
                        <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    <button class="btn" onClick=${handlePrint}><i class="fa-solid fa-print"></i> Print Quote</button>
                    <button onClick=${generatePdf} class="btn btn-primary">
                        <i class="fa-solid fa-file-arrow-down"></i> Generate PDF
                    </button>
                </div>
            `}
        </div>
        ${showPreview && html`
            <${QuotationPreviewModal}
                onClose=${() => setShowPreview(false)}
                cart=${cart}
                clientInfo=${clientInfo}
                currency=${currency}
                subtotal=${subtotal}
                discountAmount=${discountAmount}
                deliveryFee=${deliveryFee}
                total=${total}
            />
        `}
    `;
}

function App() {
    const [cart, setCart] = useState(() => {
        try {
            const localData = localStorage.getItem('obra-cart');
            return localData ? JSON.parse(localData) : [];
        } catch (error) {
            console.error("Could not parse cart from localStorage", error);
            return [];
        }
    });
    const [clientInfo, setClientInfo] = useState({ name: '', company: '', contact: '', email: '' });
    const [currency, setCurrency] = useState('PHP');
    const [generatedDescriptions, setGeneratedDescriptions] = useState({});
    const [generating, setGenerating] = useState({});
    const [generationError, setGenerationError] = useState({});
    
    // Furnitech Space Planner State
    const [furnitechLayoutOptions, setFurnitechLayoutOptions] = useState(null);
    const [selectedLayoutIndex, setSelectedLayoutIndex] = useState(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [planError, setPlanError] = useState('');

    // Furnitech Assistant State
    const [furnitechAssistantHistory, setFurnitechAssistantHistory] = useState([]);
    const [isFurnitechAssistantGenerating, setIsFurnitechAssistantGenerating] = useState(false);
    const [furnitechAssistantError, setFurnitechAssistantError] = useState('');
    const [chatSummary, setChatSummary] = useState(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    
    // Modal State
    const [modalUrl, setModalUrl] = useState(null);

    // Furnitech Image Studio State
    const [generatedFurnitechImages, setGeneratedFurnitechImages] = useState([]);
    const [isGeneratingFurnitechImages, setIsGeneratingFurnitechImages] = useState(false);
    const [furnitechImageGenerationError, setFurnitechImageGenerationError] = useState('');
    const [editedFurnitechImageResults, setEditedFurnitechImageResults] = useState([]);
    const [isEditingFurnitechImage, setIsEditingFurnitechImage] = useState(false);
    const [furnitechImageEditingError, setFurnitechImageEditingError] = useState('');

    // Wishlist State
    const [wishlist, setWishlist] = useState([]);

    // Furnitech Video Studio State
    const [generatedFurnitechVideoUrl, setGeneratedFurnitechVideoUrl] = useState(null);
    const [isGeneratingFurnitechVideo, setIsGeneratingFurnitechVideo] = useState(false);
    const [furnitechVideoGenerationError, setFurnitechVideoGenerationError] = useState('');
    const [furnitechVideoGenerationStatus, setFurnitechVideoGenerationStatus] = useState('');

    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    
    useEffect(() => {
        localStorage.setItem('obra-cart', JSON.stringify(cart));
    }, [cart]);
    
    useEffect(() => {
        const logVisitorData = () => {
            const visitorData = {
                userAgent: navigator.userAgent,
                page: window.location.href,
                timestamp: new Date().toISOString()
            };
            console.log("Security Log - Visitor Data:", visitorData);
        };
        logVisitorData();
    }, []);

    let ai;
    try {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (e) {
        console.error("Failed to initialize GoogleGenAI", e);
        // Render an error message to the user
    }

    const addLayoutToCart = (layout) => {
        setCart(prevCart => {
            const newCart = [...prevCart];
            const itemsToAdd: { [code: string]: any } = {};

            layout.zones.forEach(zone => {
                zone.furniture.forEach(item => {
                    if (itemsToAdd[item.product_code]) {
                        itemsToAdd[item.product_code].quantity += item.quantity;
                    } else {
                        const product = initialProducts.find(p => p.code === item.product_code);
                        if (product) {
                            itemsToAdd[item.product_code] = { ...product, quantity: item.quantity };
                        }
                    }
                });
            });

            Object.values(itemsToAdd).forEach(itemToAdd => {
                const selectedColor = itemToAdd.colors ? itemToAdd.colors[0] : null;
                const cartId = itemToAdd.code + (selectedColor ? `-${selectedColor.name}` : '');
                const existingItemIndex = newCart.findIndex(cartItem => cartItem.cartId === cartId);
                if (existingItemIndex > -1) {
                    newCart[existingItemIndex].quantity += itemToAdd.quantity;
                } else {
                    newCart.push({ ...itemToAdd, selectedColor, cartId });
                }
            });

            return newCart;
        });
    };
    
    const generateLayoutPlan = async (options) => {
        if (!ai) return;
        setIsPlanning(true);
        setPlanError('');
        setFurnitechLayoutOptions(null);
        setSelectedLayoutIndex(null);

        try {
            const catalogString = initialProducts.map(p => `SKU: ${p.code}, Name: ${p.name}, Category: ${p.category}, Price: ${p.price}`).join('\n');
            const styleDesc = getStyleDescriptionForOfficeType(options.officeType, options.customStyle);
            
            const prompt = `
                You are an expert office interior designer for OBRA Office Furniture. Your task is to create three distinct and creative office layout proposals based on the user's requirements and our available furniture catalog.

                **User Requirements:**
                - Office Dimensions: ${options.length}m x ${options.width}m (Total: ${options.length * options.width} sqm)
                - Number of Employees: ${options.employees}
                - Office Type: ${options.officeType} (This implies a preference for ${styleDesc})
                - Required Zones: ${options.zones}
                ${options.floorPlan ? '- A floor plan image has been provided for context.' : ''}

                **Instructions:**
                1.  Analyze all requirements. If a floor plan is provided, use it as a strong reference for the layout.
                2.  Develop THREE distinct layout concepts. Each concept should have a different theme or focus (e.g., budget-focused, collaboration-focused, executive-focused).
                3.  For each concept, select appropriate furniture ONLY from the provided catalog. You MUST use the exact 'product_code' for each item. Distribute the furniture across the required zones.
                4.  Ensure the total number of workstations or seats is appropriate for the number of employees.
                5.  For each concept, create an extremely detailed, professional visualization prompt for the image generation model. The prompt MUST be crafted to generate a photorealistic, 4K resolution architectural rendering. It should describe the layout from a top-down or isometric perspective, specifying materials (e.g., 'light oak wood floors', 'polished concrete'), textures, specific furniture models from the catalog, decor elements (like plants, art, rugs), ambient and task lighting (e.g., 'warm recessed LEDs', 'natural light from large windows'), and the overall mood. The prompt should also include a request to subtly display a minimalist 'OBRA' company logo on a wall or reception desk to enhance the branding of the concept.
                6.  Provide a short, catchy title and a brief description for each concept.
                7.  Provide a longer 'layout_summary' explaining the design choices and how the space is utilized.

                **Available Furniture Catalog:**
                ${catalogString}

                Respond ONLY with a valid JSON object that matches the provided schema. Do not include any other text or markdown.
            `;
            
            const schema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A creative, catchy title for the layout concept." },
                        description: { type: Type.STRING, description: "A brief, one-sentence description of the layout's theme." },
                        layout_summary: { type: Type.STRING, description: "A detailed paragraph explaining the design choices and space utilization." },
                        visualization_prompt: { type: Type.STRING, description: "A detailed prompt for generating a top-down or isometric visualization of the office layout." },
                        zones: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    zone_name: { type: Type.STRING },
                                    zone_dimensions: { type: Type.STRING, description: "An estimated dimension for this zone, e.g., '3m x 4m'." },
                                    furniture: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                product_code: { type: Type.STRING, description: "The exact SKU from the catalog." },
                                                quantity: { type: Type.INTEGER }
                                            },
                                            required: ['product_code', 'quantity']
                                        }
                                    }
                                },
                                required: ['zone_name', 'furniture']
                            }
                        }
                    },
                    required: ['title', 'description', 'layout_summary', 'visualization_prompt', 'zones']
                }
            };

            const parts: any[] = [{ text: prompt }];
            if (options.floorPlan) {
                parts.unshift({
                    inlineData: {
                        mimeType: options.floorPlan.mimeType,
                        data: options.floorPlan.data,
                    },
                });
            }
            const contents = { parts };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });

            const layoutPlans = JSON.parse(response.text);

            const plansWithPlaceholders = layoutPlans.map(plan => ({ ...plan, imageUrl: null, imageError: null }));
            setFurnitechLayoutOptions(plansWithPlaceholders);

            layoutPlans.forEach(async (plan, index) => {
                try {
                    const imageResponse = await ai.models.generateImages({
                        model: 'imagen-4.0-generate-001',
                        prompt: plan.visualization_prompt,
                        config: { 
                            numberOfImages: 1, 
                            aspectRatio: '1:1'
                        },
                    });
                    const imageUrl = `data:image/png;base64,${imageResponse.generatedImages[0].image.imageBytes}`;
                    setFurnitechLayoutOptions(prevOptions => {
                        const newOptions = [...prevOptions];
                        newOptions[index] = { ...newOptions[index], imageUrl: imageUrl };
                        return newOptions;
                    });
                } catch (imgError) {
                    console.error(`Image generation failed for layout ${index}:`, imgError);
                     setFurnitechLayoutOptions(prevOptions => {
                        const newOptions = [...prevOptions];
                        newOptions[index] = { ...newOptions[index], imageError: 'Failed to generate visual.' };
                        return newOptions;
                    });
                }
            });

        } catch (error) {
            console.error("Failed to generate layout plan:", error);
            setPlanError("Sorry, I couldn't generate the layout plan. The model might be unable to fulfill the request with the given constraints. Please try again or adjust your inputs.");
        } finally {
            setIsPlanning(false);
        }
    };

    const generateDescription = async (product) => {
        if (!ai) return;
        setGenerating(prev => ({ ...prev, [product.code]: true }));
        setGenerationError(prev => ({ ...prev, [product.code]: null }));

        try {
            const prompt = `Generate a concise, appealing, and professional sales description for the following office furniture product. Highlight its key features and benefits for a potential buyer. The description should be a single paragraph, maximum 3-4 sentences. Product Details: Name: ${product.name}, Category: ${product.category}, Description: ${product.description}, Dimensions: ${product.dimensions}.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            
            setGeneratedDescriptions(prev => ({ ...prev, [product.code]: response.text }));
        } catch (error) {
            console.error('Furnitech description generation failed:', error);
            setGenerationError(prev => ({ ...prev, [product.code]: 'Failed to generate description.' }));
        } finally {
            setGenerating(prev => ({ ...prev, [product.code]: false }));
        }
    };

    const generateFurnitechImages = async ({ prompt, negativePrompt, numImages, aspectRatio }) => {
        if (!ai) return;
        setIsGeneratingFurnitechImages(true);
        setFurnitechImageGenerationError('');
        setGeneratedFurnitechImages([]);

        try {
            const request: any = {
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: numImages,
                    aspectRatio: aspectRatio,
                    outputMimeType: 'image/png',
                },
            };

            if (negativePrompt && negativePrompt.trim()) {
                request.negativePrompt = negativePrompt;
            }

            const response = await ai.models.generateImages(request);

            const imageDataUrls = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
            setGeneratedFurnitechImages(imageDataUrls);

        } catch (error) {
            console.error("Failed to generate images:", error);
            setFurnitechImageGenerationError("Sorry, I couldn't generate the images. The model may have refused the prompt. Please try a different prompt.");
        } finally {
            setIsGeneratingFurnitechImages(false);
        }
    };
    
    const editFurnitechImage = async ({ prompt, image, mask }) => {
        if (!ai || !image) return;
        setFurnitechImageEditingError('');
        const originalUrl = `data:${image.mimeType};base64,${image.data}`;

        try {
            const parts = [];
            parts.push({
                inlineData: { data: image.data, mimeType: image.mimeType },
            });

            let finalPrompt = prompt;

            if (mask) {
                parts.push({
                    inlineData: { data: mask.data, mimeType: mask.mimeType }
                });
                finalPrompt = `You are an expert image editor. You will be provided with an original image, a mask image, and a text prompt. The white area in the mask image indicates the region of the original image to be modified according to the text prompt. The black area of the mask must remain untouched. Do not change the overall style of the image unless requested. Now, perform this edit: ${prompt}`;
            }
            
            parts.push({ text: finalPrompt });

            const contents = { parts };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents,
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            const result: { originalUrl: string, imageUrl?: string, text?: string, error?: string } = { originalUrl };
            for (const part of response.candidates[0].content.parts) {
                if (part.text) {
                    result.text = part.text;
                } else if (part.inlineData) {
                    const base64ImageBytes = part.inlineData.data;
                    result.imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                }
            }
            
            if (!result.imageUrl) {
                throw new Error("The model did not return an image. It may have refused the prompt due to safety policies.");
            }

            setEditedFurnitechImageResults(prev => [...prev, result]);

        } catch (error) {
            console.error("Failed to edit image:", error);
            const errorResult = { originalUrl, error: error.message || "Sorry, I couldn't edit the image." };
            setEditedFurnitechImageResults(prev => [...prev, errorResult]);
            setFurnitechImageEditingError(`An error occurred while processing image ${image.name}.`);
        }
    };


    const generateFurnitechVideo = async ({ prompt, image }) => {
        if (!ai) return;

        setIsGeneratingFurnitechVideo(true);
        setFurnitechVideoGenerationError('');
        setGeneratedFurnitechVideoUrl(null);

        const videoMessages = [
            "Our Furnitech director is reviewing your script...",
            "Setting up the virtual cameras and lighting...",
            "The digital actors are getting into character...",
            "Rendering the first few frames...",
            "This can take a few minutes, please wait...",
            "Applying visual effects and color grading...",
            "Finalizing the video production...",
        ];
        let messageIndex = 0;
        setFurnitechVideoGenerationStatus(videoMessages[messageIndex]);
        const statusInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % videoMessages.length;
            setFurnitechVideoGenerationStatus(videoMessages[messageIndex]);
        }, 5000);

        try {
            const requestPayload: any = {
                model: 'veo-2.0-generate-001',
                prompt: prompt,
                config: { numberOfVideos: 1 }
            };

            if (image) {
                requestPayload.image = {
                    imageBytes: image.data,
                    mimeType: image.mimeType
                };
            }

            let operation = await ai.models.generateVideos(requestPayload);

            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }
            
            clearInterval(statusInterval);
            setFurnitechVideoGenerationStatus('');

            if (operation.response) {
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (downloadLink) {
                    setFurnitechVideoGenerationStatus("Downloading generated video...");
                    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                    if (!videoResponse.ok) {
                        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
                    }
                    const videoBlob = await videoResponse.blob();
                    const videoUrl = URL.createObjectURL(videoBlob);
                    setGeneratedFurnitechVideoUrl(videoUrl);
                } else {
                    throw new Error("Video generation completed, but no download link was provided.");
                }
            } else {
                 throw new Error("Video generation operation did not return a valid response.");
            }

        } catch (error) {
            console.error("Failed to generate video:", error);
            setFurnitechVideoGenerationError("Sorry, I couldn't generate the video. This might be due to a safety policy or a temporary issue. Please try a different prompt.");
            clearInterval(statusInterval);
            setFurnitechVideoGenerationStatus('');
        } finally {
            setIsGeneratingFurnitechVideo(false);
        }
    };

    const generateFurnitechResponse = async (prompt, useWebSearch) => {
        if (!ai) return;

        setFurnitechAssistantHistory(prev => [...prev, { role: 'user', content: prompt }]);
        setIsFurnitechAssistantGenerating(true);
        setFurnitechAssistantError('');
        
        try {
            const catalogString = initialProducts.map(p => `[SKU:${p.code}] ${p.name} (${p.category}) - ${formatCurrency(p.price, currency)}`).join('\n');
            const systemInstruction = `You are OBRA's Furnitech Assistant, an expert in office design and furniture solutions. Your goal is to provide creative and helpful guidance to users.
- Be creative and detailed in your suggestions. Consider the user's potential business type (e.g., startup, law firm) and offer a few different options to fit their style and budget, rather than a single best answer.
- When you recommend a product, you MUST mention it using the format [SKU:PRODUCT_CODE_HERE].
- Be friendly, helpful, and professional.
- When the web search tool is enabled, use it to answer questions about current information or recent design trends, and always cite your sources.
- Keep responses concise and easy to read. Use markdown for formatting.

Product Catalog:
${catalogString}`;

            const config: { systemInstruction: string, tools?: any[] } = { systemInstruction };
            if (useWebSearch) {
                 config.tools = [{ googleSearch: {} }];
            }

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config
            });

            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            
            setFurnitechAssistantHistory(prev => [...prev, {
                role: 'model',
                content: response.text,
                groundingChunks: groundingChunks
            }]);

        } catch (error) {
            console.error('Furnitech assistant error:', error);
            setFurnitechAssistantError('Sorry, something went wrong. Please try again.');
        } finally {
            setIsFurnitechAssistantGenerating(false);
        }
    };

    const summarizeChat = async () => {
        if (!ai || furnitechAssistantHistory.length === 0) return;
        setIsSummarizing(true);
        setChatSummary(null);
        setFurnitechAssistantError('');

        try {
            const historyString = furnitechAssistantHistory.map(msg => `${msg.role === 'user' ? 'Client' : 'Furnitech Assistant'}: ${msg.content}`).join('\n\n');
            const prompt = `Please provide a concise summary of the following conversation between a client and a Furnitech assistant for an office furniture company. Highlight key product recommendations (including their SKUs if mentioned), client requirements, important decisions made, and any unresolved questions or action items.

            **Conversation History:**
            ${historyString}

            **Summary:**`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            setChatSummary(response.text);

        } catch (error) {
            console.error('Chat summary error:', error);
            setFurnitechAssistantError('Sorry, I couldn\'t summarize the chat. Please try again.');
        } finally {
            setIsSummarizing(false);
        }
    };
    
    if (!ai) {
      return html`
        <div class="card" style=${{margin: '2rem', border: '1px solid #dc3545'}}>
            <h2 style=${{color: '#dc3545'}}>Configuration Error</h2>
            <p>The Furnitech service could not be initialized. Please ensure the API key is correctly configured in the environment variables.</p>
        </div>
      `;
    }

    return html`
        <${AppContext.Provider} value=${{
            cart, setCart,
            clientInfo, setClientInfo,
            currency, setCurrency,
            generatedDescriptions, generating, generationError, generateDescription,
            furnitechLayoutOptions, setFurnitechLayoutOptions, selectedLayoutIndex, setSelectedLayoutIndex, isPlanning, planError, generateLayoutPlan, addLayoutToCart,
            furnitechAssistantHistory, isFurnitechAssistantGenerating, furnitechAssistantError, generateFurnitechResponse,
            chatSummary, setChatSummary, isSummarizing, summarizeChat,
            modalUrl, setModalUrl,
            generatedFurnitechImages, isGeneratingFurnitechImages, furnitechImageGenerationError, generateFurnitechImages,
            editedFurnitechImageResults, setEditedFurnitechImageResults, isEditingFurnitechImage, setIsEditingFurnitechImage, furnitechImageEditingError, editFurnitechImage,
            wishlist, setWishlist,
            generatedFurnitechVideoUrl, isGeneratingFurnitechVideo, furnitechVideoGenerationError, furnitechVideoGenerationStatus, generateFurnitechVideo,
            isAuthenticated, setIsAuthenticated, showAuthModal, setShowAuthModal,
        }}>
            <header>
                <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Office Furniture Logo" class="header-logo" />
                <div class="header-controls">
                    <div class="currency-selector">
                        <i class="fa-solid fa-coins"></i>
                        <span>Currency:</span>
                        <select value=${currency} onChange=${e => setCurrency(e.target.value)}>
                            ${Object.keys(currencyRates).map(c => html`<option value=${c}>${c}</option>`)}
                        </select>
                    </div>
                     ${!isAuthenticated
                        ? html`
                            <button class="btn" onClick=${() => setShowAuthModal(true)}>
                                <i class="fa-solid fa-right-to-bracket"></i> Log In / Sign Up
                            </button>`
                        : html`
                            <button class="btn" onClick=${() => setIsAuthenticated(false)}>
                                <i class="fa-solid fa-right-from-bracket"></i> Log Out
                            </button>`
                    }
                </div>
            </header>
            <main class="container">
                <div class="main-layout">
                    <div class="content-section">
                        <${ProductBundles} />
                        <${ProductGrid} />
                        
                        <h2 class="section-title">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            Unlock Advanced Furnitech Tools
                        </h2>

                        <${GatedFeature} 
                            title="Furnitech Office Space Planner" 
                            iconClass="fa-solid fa-drafting-compass"
                            description="Describe your space and get three AI-generated layout concepts with furniture recommendations and visualizations."
                        >
                            <${FurnitechSpacePlanner} />
                        <//>
                        <${GatedFeature} 
                            title="Furnitech Image Studio" 
                            iconClass="fa-solid fa-paintbrush"
                            description="Generate inspirational images, logos, or product mockups. You can also edit existing images with a text prompt."
                        >
                            <${FurnitechImageStudio} />
                        <//>
                        <${GatedFeature} 
                            title="Furnitech Video Studio" 
                            iconClass="fa-solid fa-film"
                            description="Create short promotional videos from a text description or a starting image to bring your concepts to life."
                        >
                            <${FurnitechVideoStudio} />
                        <//>
                         <${GatedFeature} 
                            title="Furnitech Assistant" 
                            iconClass="fa-solid fa-comments-dollar"
                            description="Ask for product recommendations, design ideas, or the latest industry trends with our intelligent chat assistant."
                         >
                            <${FurnitechAssistant} />
                        <//>
                    </div>
                    <aside>
                        <${ClientInfoForm} />
                        <${Wishlist} />
                        <${Quotation} />
                    </aside>
                </div>
            </main>
            <footer>
                <div class="footer-content">
                    <div class="footer-contact">
                        <a href="mailto:obrafurniture@gmail.com"><i class="fa-solid fa-envelope"></i> obrafurniture@gmail.com</a>
                        <span><i class="fa-solid fa-phone"></i> +63 915 743 9188</span>
                        <a href="https://facebook.com/obraofficefurniture" target="_blank"><i class="fa-brands fa-facebook"></i> facebook.com/obraofficefurniture</a>
                    </div>
                    <p>&copy; ${new Date().getFullYear()} OBRA Office Furniture. All rights reserved.</p>
                </div>
            </footer>
            
            ${modalUrl && html`<${WebsitePreviewModal} url=${modalUrl} onClose=${() => setModalUrl(null)} />`}
            <${OnboardingModal} />
            <${AuthModal} />
        <//>
    `;
}

render(html`<${App} />`, document.getElementById('root'));