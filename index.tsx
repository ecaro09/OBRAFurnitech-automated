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
        case 'Tech Hub': return 'a sleek, modern, and minimalist design, focusing on technology integration, and perhaps incorporating brand colors';
        case 'Law Firm': return 'a traditional and elegant aesthetic, featuring dark wood, leather upholstery, and a sense of gravitas and stability';
        case 'Co-working Space': return 'a diverse, flexible, and comfortable environment with zoned areas that have different moods, often with a mix of industrial and residential touches';
        default: return 'a modern and functional';
    }
};

// Base64 encoded OBRA Office Furniture logo
const obraLogo = "PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDMwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHN0eWxlPi50ZXh0IHsgZm9udC1mYW1pbHk6ICdNb250c2VycmF0Jywgc2Fucy1zZXJpZjsgZm9udC1zaXplOiA0MHB4OyBmb250LXdlaWdodDogNzAwOyBmaWxsOiAjMWMxZTIxOyB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlOyB9IC5zaGFwZSB7IGZpbGw6ICMwZDZlZmQ7IH08L3N0eWxlPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsIDEwKSI+PHBhdGggY2xhc3M9InNoYXBlIiBkPSJNNDAsMCBDMTcuOSwwIDAsMTcuOSAwLDQwIEMwLDYyLjEgMTcuOSw4MCA0MCw4MCBDNjIuMSw4MCA4MCw2Mi4xIDgwLDQwIEM4MCwxNy45IDYyLjEsMCA0MCwwIFogTTQwLDcwIEMyMy40LDcwIDEwLDU2LjYgMTAsNDAgQzEwLDIzLjQgMjMuNCwxMCA0MCwxMCBDNTYuNiwxMCA3MCwyMy40IDcwLDQwIEM3MCw1Ni42IDU2LjYsNzAgNDAsNzAgWiIgLz48cmVjdCB4PSIzNSIgeT0iMjAiIHdpZHRoPSIxMCIgaGVpZ2h0PSI0MCIgcng9IjUiIGZpbGw9IiNmZmYiIC8+PC9nPjx0ZXh0IHg9Ijk1IiB5PSI2NSIgY2xhc3M9InRleHQiPk9CUkEgRnVybml0ZWNoPC90ZXh0Pjwvc3ZnPg==";

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

// --- Data from OBRA Catalog ---
const initialProducts = [
    {"code":"OBSC-RS4","name":"4 Layer Vertical Steel Filing Cabinet","category":"Storage","price":"7900.00","description":"Maximize your office organization with our Superior Gang Drawer, designed for efficiency and security. This robust storage solution comes with a locking system and two keys, ensuring your documents are safe and private.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/Vertical-Recessed.jpg"},
    {"code":"OBET-528fJ","name":"Executive Office Chair","category":"Office Chairs","price":"5699.00","description":"Step into the realm of comfort and elegance with our High-back Leatherette Executive Chair. Designed for the discerning professional, this chair features a 360° swivel mechanism and a chrome-plated star-base for a sleek, modern look.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/7-2.png", "colors": [{ "name": "Black", "hex": "#212529" }, { "name": "Brown", "hex": "#8B4513" }]},
    {"code":"OBET-SQ-1801","name":"Executive Table","category":"Executive Tables","price":"21499.00","description":"Elevate your professional space with our Executive Table, a symbol of sophistication and functionality. Finished with a high-quality melamine surface, this table is not only stylish but also exceptionally durable. It features a close-in cabinet and a mobile pedestal.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/5-1.jpg"},
    {"code":"OBRA-WLS15","name":"15-Door Steel Locker","category":"Storage","price":"13299.00","description":"Optimize your storage with our Powder Coated Metal Locker Cabinet, crafted from high-quality cold-rolled steel for unmatched durability. This locker cabinet features recessed handles, a card holder, and air ventilation.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/3LB5.png"},
    {"code":"OBOT-614","name":"Melamine Wood Office Table","category":"Office Tables","price":"8299.00","description":"Elevate Your Workspace: Discover the perfect blend of style and functionality with our Melamine Wood Office Table. Designed with a soft-close cabinet door and a convenient grommet for cable management, this table is a must-have for any modern professional.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/9-3.jpg", "colors": [{ "name": "Oak Gray", "hex": "#BDB7AB" }, { "name": "Walnut", "hex": "#5C4033" }]},
    {"code":"OBTT-FT12","name":"Foldable Training Table","category":"Conference Tables","price":"5499.00","description":"Maximize Your Training Space: Introducing our White MDF Training Table, the epitome of modern functionality. Crafted with a high-quality laminated finish, this table is not only aesthetically pleasing but also incredibly durable.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/Training-Table-3.webp"},
    {"code":"OBCT-CFT24","name":"12-Seater Conference Table","category":"Conference Tables","price":"13899.00","description":"Our 12 Seater Conference Table is the cornerstone of any large meeting room, offering ample space for teams to gather and strategize. The boat-shaped design and quality construction provide a professional setting for productive meetings.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/26-1.png"},
    {"code":"OBEC-04AJNSX","name":"High Back Mesh Executive Chair","category":"Office Chairs","price":"4499.00","description":"Discover the epitome of comfort and style with our High Back Mesh Executive Chair. Designed for the discerning professional, this chair features a breathable mesh back that contours to your body, providing exceptional support throughout the workday.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/1000043584.jpg", "colors": [{ "name": "Black", "hex": "#212529" }, { "name": "Grey", "hex": "#6c757d" }, { "name": "Blue", "hex": "#0d6efd" }] },
    {"code":"OBOT-171618","name":"L-Shape Executive Office Table","category":"Executive Tables","price":"23499.00","description":"Transform your office into a haven of sophistication with our meticulously designed Wooden L-type Executive Table. This premium table is thoughtfully equipped with a system unit bin, allowing you to keep your computer or other devices neatly tucked away.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/8-3.png"},
    {"code":"OBOC-MNKC1","name":"Fabric Office Chair","category":"Office Chairs","price":"2699.00","description":"Upgrade your office space with our premium Fabric Office Chair. Designed for both comfort and style, this chair is a perfect choice for long hours of work. With a 360-degree swivel function, you can easily move around your workspace without any hassle.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/600x600-39-1.jpg", "colors": [{ "name": "Charcoal", "hex": "#343a40" }, { "name": "Ruby Red", "hex": "#ca1e48" }, { "name": "Forest Green", "hex": "#228B22" }]},
    {"code":"OBET-GT16","name":"Glass Top Executive Office Table","category":"Executive Tables","price":"19499.00","description":"Transform your workspace with our exquisite office furniture set. The centerpiece, a stunning tempered glass counter-top, sits atop robust melamine legs, ensuring stability and longevity.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/6-3.webp"},
    {"code":"OBOT-T01","name":"Metal Office Table","category":"Office Tables","price":"5499.00","description":"Introducing our eco-conscious office desk, meticulously crafted with an acid-washed phosphatized treatment and finished with an electrostatic powder coating to ensure durability while being kind to the planet.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/25-2.png"},
    {"code":"OBWT-4S","name":"4-Seater Workstation Table","category":"Workstations","price":"16899.00","description":"Transform your workspace with our stylish and functional 4-seater workstation, designed to foster collaboration and maximize efficiency. Each workstation boasts a chic oak gray wood top and a vibrant choice of red or blue dividers.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/1000035614.jpg", "colors": [{ "name": "Red Divider", "hex": "#dc3545" }, { "name": "Blue Divider", "hex": "#0d6efd" }] },
    {"code":"OBGC-S4","name":"4-Seater Gang Chair","category":"Office Chairs","price":"8199.00","description":"Introducing the ultimate seating solution – our Gang Chair, engineered for durability and comfort in busy environments. With its sleek profile and robust construction, this chair is an ideal choice for offices, conference rooms, and classrooms.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/4-Gang-Chair.jpg"},
    {"code":"OBST-WLS28","name":"Glass Door Steel Cabinet","category":"Storage","price":"9999.00","description":"Present your collectibles, books, or awards in our elegant Metal Display Cabinet, a perfect blend of functionality and design. The robust powder-coated metal structure ensures durability, while the two swing glass doors offer a clear view.","imageUrl":"https://obrafurniture.com/wp-content/uploads/2024/06/22-2-1.jpg"}
];

const productBundles = [
    {
        id: 'bundle-exec-starter',
        name: 'Executive Starter Pack',
        description: 'A complete setup for a manager\'s office, combining elegance and functionality for peak productivity.',
        items: [
            { code: 'OBET-SQ-1801', quantity: 1 }, // L-Type Executive Glass Top Table
            { code: 'OBET-528fJ', quantity: 1 },    // High back executive chair
            { code: 'OBSC-RS4', quantity: 1 }      // Lateral Filing Steel Cabinet
        ]
    },
    {
        id: 'bundle-team-hub-4',
        name: '4-Person Workstation Hub',
        description: 'Equip your team with this modern and efficient 4-seater workstation, complete with ergonomic chairs.',
        items: [
            { code: 'OBWT-4S', quantity: 1 },    // 4-Seater Workstation
            { code: 'OBEC-04AJNSX', quantity: 4 },    // Mesh Office Chair
        ]
    }
];


const currencyRates = {
    PHP: { rate: 1, symbol: '₱' },
    USD: { rate: 0.017, symbol: '$' },
    EUR: { rate: 0.016, symbol: '€' },
};

const AppContext = createContext({
    products: initialProducts,
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
    setShowAuthModal: (value: any) => {},
    isVisualizingProduct: false,
    visualizedProduct: null,
    visualizationResult: null,
    visualizeProduct: async (product: any, sceneDescription: string) => {},
    startVisualization: (product: any) => {},
    clearVisualization: () => {},
    initialStudioImage: null,
    setInitialStudioImage: (value: any) => {},
    discount: 0,
    setDiscount: (value: any) => {},
    discountType: 'PHP',
    setDiscountType: (value: any) => {},
    deliveryFee: 0,
    setDeliveryFee: (value: any) => {},
    logoPng: null,
    canvasItems: [],
    setCanvasItems: (value: any) => {},
    expandedProductCode: null,
    setExpandedProductCode: (value: any) => {},
});

const formatCurrency = (amount, currency) => {
    const { symbol } = currencyRates[currency];
    const value = Number(amount) * currencyRates[currency].rate;
    return `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const downloadImage = (dataUrl: string, name: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `obra-image-${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- MODAL & AUTHENTICATION ---

function Modal({ children, onClose, size = 'default' }) {
    const modalClass = size === 'preview' ? 'modal-content-preview' :
                       size === 'website' ? 'modal-content-website' : '';

    return html`
        <div class="modal-overlay" onClick=${onClose}>
            <div class="modal-content ${modalClass}" onClick=${e => e.stopPropagation()}>
                ${children}
            </div>
        </div>
    `;
}

function AuthModal({ onAuthSuccess }) {
    const { setShowAuthModal } = useContext(AppContext);
    return html`
         <div class="modal-overlay">
            <div class="auth-modal" onClick=${e => e.stopPropagation()}>
                <div class="auth-content">
                    <div class="auth-icon"><i class="fa-solid fa-lock"></i></div>
                    <h2>Exclusive Feature</h2>
                    <p>This advanced AI tool is available for registered users. Please sign in to continue.</p>
                    <div class="auth-actions">
                         <button class="btn btn-primary" onClick=${onAuthSuccess}>
                            <i class="fa-solid fa-user-check"></i> Sign In to Unlock
                        </button>
                    </div>
                    <p class="auth-note">This is a simulated sign-in for demonstration purposes.</p>
                </div>
                 <button class="modal-close-btn" onClick=${() => setShowAuthModal(false)}>×</button>
            </div>
        </div>
    `;
}

function GatedFeature({ children, featureName, featureIcon, featureDescription }) {
    const { isAuthenticated, setShowAuthModal, setIsAuthenticated } = useContext(AppContext);

    if (isAuthenticated) {
        return children;
    }

    const handleAuthSuccess = () => {
        setIsAuthenticated(true);
        setShowAuthModal(false);
    };

    return html`
        <div class="gated-feature-placeholder">
            <div class="gated-content">
                <div class="gated-icon-feature"><i class=${featureIcon}></i></div>
                <h3 class="gated-title">${featureName}</h3>
                <p class="gated-description">${featureDescription}</p>
                <button class="btn btn-primary" onClick=${() => setShowAuthModal(true)}>
                    <i class="fa-solid fa-lock"></i> Unlock with Sign-In
                </button>
            </div>
        </div>
    `;
}

// --- QUOTATION PREVIEW ---

function QuotationPreviewModal({ onClose }) {
    const { cart, clientInfo, currency, discount, discountType, deliveryFee, logoPng } = useContext(AppContext);

    const subtotal = cart.reduce((acc, item) => acc + (Number(item.product.price) * item.quantity), 0);
    const discountAmount = discountType === '%' ? subtotal * (discount / 100) : discount;
    const total = subtotal - discountAmount + Number(deliveryFee);

    const handleDownloadPdf = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Add Header
        if (logoPng) {
             doc.addImage(logoPng, 'PNG', 15, 10, 60, 20);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text('QUOTATION', pageWidth - 15, 25, { align: 'right' });

        // Add Client and Company Info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`Date: ${today}`, pageWidth - 15, 40, { align: 'right' });
        doc.text(`Quotation No: Q-${String(Date.now()).slice(-6)}`, pageWidth - 15, 45, { align: 'right' });

        doc.text('Bill To:', 15, 40);
        doc.setFont('helvetica', 'bold');
        doc.text(clientInfo.name || 'N/A', 15, 45);
        doc.setFont('helvetica', 'normal');
        doc.text(clientInfo.company || 'N/A', 15, 50);
        doc.text(clientInfo.contact || 'N/A', 15, 55);
        doc.text(clientInfo.email || 'N/A', 15, 60);

        // Add Table using autoTable
        autoTable(doc, {
            startY: 70,
            head: [['Code', 'Product Name', 'Unit Price', 'Quantity', 'Total']],
            body: cart.map(item => [
                item.product.code,
                item.product.name + (item.selectedColor ? ` (${item.selectedColor.name})` : ''),
                formatCurrency(item.product.price, currency),
                item.quantity,
                formatCurrency(Number(item.product.price) * item.quantity, currency)
            ]),
            theme: 'striped',
            headStyles: { fillColor: [22, 22, 22] },
            styles: { fontSize: 9 },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'center' },
                4: { halign: 'right' },
            }
        });

        // Add Totals
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        const totalsX = pageWidth - 60;
        const totalsXValue = pageWidth - 15;

        doc.text('Subtotal:', totalsX, finalY);
        doc.text(formatCurrency(subtotal, currency), totalsXValue, finalY, { align: 'right' });
        
        doc.text('Discount:', totalsX, finalY + 5);
        const discountText = discountType === '%' ? `${discount}%` : formatCurrency(discount, currency);
        doc.text(`-${discountText}`, totalsXValue, finalY + 5, { align: 'right' });

        doc.text('Delivery Fee:', totalsX, finalY + 10);
        doc.text(formatCurrency(deliveryFee, currency), totalsXValue, finalY + 10, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Total:', totalsX, finalY + 18);
        doc.text(formatCurrency(total, currency), totalsXValue, finalY + 18, { align: 'right' });
        
        doc.save(`OBRA-Quotation-${clientInfo.company || 'general'}.pdf`);
    };

    return html`
        <${Modal} onClose=${onClose} size="preview">
            <div class="modal-header">
                <h2>Quotation Preview</h2>
                <button class="modal-close-btn" onClick=${onClose}>×</button>
            </div>
            <div class="modal-body">
                <div class="preview-header">
                    ${logoPng && html`<img src=${logoPng} alt="OBRA Furnitech Logo" />`}
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
                        <p><strong>OBRA Furnitech</strong></p>
                        <p>12 Santan Quezon City Philippines 1116</p>
                        <p>obrafurniture@gmail.com</p>
                        <p>+63915 743 9188</p>
                    </div>
                </div>
                <table class="preview-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Product Name</th>
                            <th class="align-right">Unit Price</th>
                            <th class="align-right">Quantity</th>
                            <th class="align-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cart.map(item => html`
                            <tr>
                                <td>${item.product.code}</td>
                                <td>${item.product.name} ${item.selectedColor ? `(${item.selectedColor.name})` : ''}</td>
                                <td class="align-right">${formatCurrency(item.product.price, currency)}</td>
                                <td class="align-right">${item.quantity}</td>
                                <td class="align-right">${formatCurrency(Number(item.product.price) * item.quantity, currency)}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
                <div class="preview-totals">
                    <div class="total-line">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal, currency)}</span>
                    </div>
                    ${discount > 0 && html`
                        <div class="total-line">
                            <span>Discount ${discountType === '%' ? `(${discount}%)` : ''}</span>
                            <span>-${formatCurrency(discountAmount, currency)}</span>
                        </div>
                    `}
                    ${deliveryFee > 0 && html`
                         <div class="total-line">
                            <span>Delivery Fee</span>
                            <span>${formatCurrency(deliveryFee, currency)}</span>
                        </div>
                    `}
                    <div class="total-line grand-total">
                        <span>Total</span>
                        <span>${formatCurrency(total, currency)}</span>
                    </div>
                </div>
                 <div class="preview-footer">
                    <p>Thank you for your business!</p>
                    <p>Prices are valid for 30 days. Terms and conditions apply.</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onClick=${onClose}>Close</button>
                <button class="btn btn-primary" onClick=${handleDownloadPdf}><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
            </div>
        </${Modal}>
    `;
}

function WebsiteModal({ url, onClose }) {
    if (!url) return null;
    return html`
        <${Modal} onClose=${onClose} size="website">
            <div class="modal-header">
                <h2>Browsing: ${url}</h2>
                <button class="modal-close-btn" onClick=${onClose}>×</button>
            </div>
            <div class="modal-body">
                <iframe src=${url} title="Website Viewer"></iframe>
            </div>
        </${Modal}>
    `;
}

// --- MAIN UI COMPONENTS ---

function CtaBanner() {
    return html`
        <div class="cta-banner">
            <div class="cta-content">
                <h2>Welcome to OBRA Furnitech!</h2>
                <p>Your one-stop solution for modern office furniture. Start building your quote or use our AI tools to design your perfect workspace.</p>
            </div>
        </div>
    `;
}

function ClientInfoCard() {
    const { clientInfo, setClientInfo } = useContext(AppContext);

    const handleChange = (e) => {
        setClientInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-user-tie"></i>
                    <h2 class="card-title">Client Information</h2>
                </div>
            </div>
            <form class="client-info-form">
                <div class="form-group">
                    <label for="name">Name</label>
                    <input type="text" id="name" name="name" placeholder="e.g., Juan dela Cruz" value=${clientInfo.name} onInput=${handleChange} />
                </div>
                <div class="form-group">
                    <label for="company">Company</label>
                    <input type="text" id="company" name="company" placeholder="e.g., OBRA Inc." value=${clientInfo.company} onInput=${handleChange} />
                </div>
                <div class="form-group">
                    <label for="contact">Contact No.</label>
                    <input type="tel" id="contact" name="contact" placeholder="e.g., 09171234567" value=${clientInfo.contact} onInput=${handleChange} />
                </div>
                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" name="email" placeholder="e.g., juan.delacruz@obra.com" value=${clientInfo.email} onInput=${handleChange} />
                </div>
            </form>
        </div>
    `;
}

function WishlistCard() {
    const { wishlist, setWishlist, cart, setCart, currency } = useContext(AppContext);

    const handleRemoveFromWishlist = (productCode) => {
        setWishlist(prev => prev.filter(p => p.code !== productCode));
    };
    
    const handleAddToCart = (product) => {
        const existingItem = cart.find(item => item.product.code === product.code);
        if (existingItem) {
            setCart(prev => prev.map(item =>
                item.product.code === product.code ? { ...item, quantity: item.quantity + 1 } : item
            ));
        } else {
            setCart(prev => [...prev, { product, quantity: 1, id: Date.now() }]);
        }
        handleRemoveFromWishlist(product.code);
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                 <div class="card-title-main">
                    <i class="fa-solid fa-heart"></i>
                    <h2 class="card-title">Wishlist</h2>
                </div>
                <div class="wishlist-count">${wishlist.length}</div>
            </div>
            ${wishlist.length === 0 ? html`
                <div class="empty-wishlist">
                    <i class="fa-regular fa-heart"></i>
                    <p>Your wishlist is empty.<br/>Click the heart icon on products to save them for later.</p>
                </div>
            ` : html`
                <div class="wishlist-items">
                    ${wishlist.map(product => html`
                        <div class="wishlist-item" key=${product.code}>
                            <div class="wishlist-item-details">
                                <p class="item-name">${product.name}</p>
                                <p class="item-price">${formatCurrency(product.price, currency)}</p>
                            </div>
                            <div class="wishlist-item-controls">
                                 <button class="btn-icon btn-delete" onClick=${() => handleRemoveFromWishlist(product.code)} aria-label="Remove from wishlist" data-tooltip="Remove">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                                <button class="btn-icon" onClick=${() => handleAddToCart(product)} aria-label="Add to cart" data-tooltip="Add to Cart">
                                    <i class="fa-solid fa-cart-plus"></i>
                                </button>
                            </div>
                        </div>
                    `)}
                </div>
            `}
        </div>
    `;
}

function CartItem({ item }) {
    const { cart, setCart, currency } = useContext(AppContext);

    const handleQuantityChange = (amount) => {
        const newQuantity = item.quantity + amount;
        if (newQuantity > 0) {
            setCart(cart.map(i => i.id === item.id ? { ...i, quantity: newQuantity } : i));
        }
    };

    const handleRemove = () => {
        setCart(cart.filter(i => i.id !== item.id));
    };

    return html`
        <div class="cart-item">
            <div class="item-details">
                <p class="item-name">
                    ${item.product.name}
                    ${item.selectedColor && html`<span class="item-color">(${item.selectedColor.name})</span>`}
                </p>
                <p class="item-price">${formatCurrency(item.product.price, currency)} / unit</p>
            </div>
            <div class="item-controls">
                <button class="btn-quantity" onClick=${() => handleQuantityChange(-1)} aria-label="Decrease quantity">−</button>
                <span class="item-quantity">${item.quantity}</span>
                <button class="btn-quantity" onClick=${() => handleQuantityChange(1)} aria-label="Increase quantity">+</button>
                <button class="btn-delete" onClick=${handleRemove} aria-label="Remove item">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `;
}

function QuotationSummary() {
    const { cart, currency, discount, setDiscount, discountType, setDiscountType, deliveryFee, setDeliveryFee } = useContext(AppContext);

    const subtotal = useMemo(() =>
        cart.reduce((acc, item) => acc + (Number(item.product.price) * item.quantity), 0),
        [cart]
    );

    const discountAmount = useMemo(() =>
        discountType === '%' ? subtotal * (Number(discount) / 100) : Number(discount),
        [subtotal, discount, discountType]
    );

    const total = useMemo(() =>
        subtotal - discountAmount + Number(deliveryFee),
        [subtotal, discountAmount, deliveryFee]
    );

    return html`
        <div class="summary-divider"></div>
        <div class="summary-extras">
            <div class="summary-line-item-input">
                <span>Discount</span>
                <div class="input-group">
                    <input type="number" value=${discount} onInput=${e => setDiscount(e.target.value)} placeholder="0.00" />
                     <div class="discount-toggle">
                        <button class="toggle-btn ${discountType === 'PHP' ? 'active' : ''}" onClick=${() => setDiscountType('PHP')}>${currencyRates[currency].symbol}</button>
                        <button class="toggle-btn ${discountType === '%' ? 'active' : ''}" onClick=${() => setDiscountType('%')}>%</button>
                    </div>
                </div>
            </div>
            <div class="summary-line-item-input">
                <span>Delivery Fee</span>
                <div class="delivery-fee-group">
                    <span>${currencyRates[currency].symbol}</span>
                    <input type="number" value=${deliveryFee} onInput=${e => setDeliveryFee(e.target.value)} placeholder="0.00" />
                </div>
            </div>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-total">
            <div class="summary-line-item">
                <span>Subtotal</span>
                <span>${formatCurrency(subtotal, currency)}</span>
            </div>
            ${discount > 0 && html`
                <div class="summary-line-item">
                    <span>Discount</span>
                    <span>-${formatCurrency(discountAmount, currency)}</span>
                </div>
            `}
            <div class="summary-line-item">
                <span>Total</span>
                <span>${formatCurrency(total, currency)}</span>
            </div>
        </div>
    `;
}

function QuotationCard() {
    const { cart, setCart } = useContext(AppContext);
    const [showPreview, setShowPreview] = useState(false);

    const handleClear = () => {
        if (confirm('Are you sure you want to clear all items from the quotation?')) {
            setCart([]);
        }
    };
    
    return html`
        <div class="card quotation">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Logo" class="quotation-logo" />
                </div>
                <${HeaderControls} />
            </div>
            
            <div class="cart-items">
                ${cart.length > 0 ? cart.map(item => html`<${CartItem} key=${item.id} item=${item} />`) : html`
                    <div class="empty-cart">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <p>Your quotation is empty.<br/>Add products from the catalog to get started.</p>
                    </div>
                `}
            </div>
            
            ${cart.length > 0 && html`
                <${QuotationSummary} />
                <div class="actions">
                    <button class="btn" onClick=${handleClear}><i class="fa-solid fa-trash-can"></i> Clear All</button>
                    <button class="btn btn-primary" onClick=${() => setShowPreview(true)}><i class="fa-solid fa-file-invoice"></i> Generate Quote</button>
                </div>
            `}
        </div>
        ${showPreview && html`<${QuotationPreviewModal} onClose=${() => setShowPreview(false)} />`}
    `;
}

function ProductListItem({ product }) {
    const { 
        cart, setCart, currency,
        wishlist, setWishlist,
        startVisualization, isAuthenticated, setShowAuthModal,
        generating, generatedDescriptions, generationError, generateDescription,
        expandedProductCode, setExpandedProductCode
    } = useContext(AppContext);

    const isExpanded = expandedProductCode === product.code;
    const [quantity, setQuantity] = useState(1);
    const [selectedColor, setSelectedColor] = useState(product.colors ? product.colors[0] : null);

    const handleToggle = () => {
        setExpandedProductCode(isExpanded ? null : product.code);
    };

    const isGeneratingDesc = generating[product.code];
    const description = generatedDescriptions[product.code];
    const error = generationError[product.code];

    const handleAddToCart = () => {
        const existingItem = cart.find(item => item.product.code === product.code && item.selectedColor?.hex === selectedColor?.hex);
        if (existingItem) {
            setCart(cart.map(item => item.id === existingItem.id ? { ...item, quantity: item.quantity + quantity } : item));
        } else {
            setCart([...cart, { product, quantity, id: Date.now(), selectedColor }]);
        }
    };
    
    const isInWishlist = wishlist.some(p => p.code === product.code);
    const handleToggleWishlist = () => {
        if (isInWishlist) {
            setWishlist(wishlist.filter(p => p.code !== product.code));
        } else {
            setWishlist([...wishlist, product]);
        }
    };

    const handleVisualizeClick = () => {
        if (!isAuthenticated) {
            setShowAuthModal(true);
        } else {
            startVisualization(product);
        }
    };

    return html`
        <div class="product-list-item ${isExpanded ? 'expanded' : ''}">
            <div class="product-list-item-header" onClick=${handleToggle}>
                <div class="header-info">
                    <h3 class="product-name">${product.name}</h3>
                    <span class="product-category">${product.category}</span>
                </div>
                <div class="header-price-toggle">
                    <span class="product-price">${formatCurrency(product.price, currency)}</span>
                    <button class="btn-toggle-details" aria-expanded=${isExpanded}>
                        <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </button>
                </div>
            </div>
            <div class="product-list-item-details-wrapper">
                <div class="product-list-item-details">
                    <div class="details-image">
                        <img src=${product.imageUrl} alt=${product.name} loading="lazy" />
                    </div>
                    <div class="details-info">
                        <p class="details-description">${product.description}</p>
                        
                        ${product.colors && html`
                            <div class="details-colors">
                                <h4 class="detail-subtitle">Color: <span>${selectedColor.name}</span></h4>
                                <div class="color-swatches">
                                    ${product.colors.map(color => html`
                                        <button 
                                            class="color-swatch ${selectedColor.hex === color.hex ? 'selected' : ''}" 
                                            style=${{ backgroundColor: color.hex }}
                                            onClick=${() => setSelectedColor(color)}
                                            aria-label=${`Select color ${color.name}`}
                                        ></button>
                                    `)}
                                </div>
                            </div>
                        `}

                        <div class="details-actions">
                            <div class="quantity-selector">
                                <button class="btn-quantity" onClick=${() => setQuantity(q => Math.max(1, q - 1))}>-</button>
                                <span class="item-quantity">${quantity}</span>
                                <button class="btn-quantity" onClick=${() => setQuantity(q => q + 1)}>+</button>
                            </div>
                            <button class="btn btn-primary btn-add-to-quote" onClick=${handleAddToCart}>
                                <i class="fa-solid fa-cart-plus"></i> Add to Quote
                            </button>
                        </div>

                        <div class="details-extra-actions">
                            <button class="btn-extra-action" onClick=${handleToggleWishlist}>
                                <i class="fa-solid fa-heart ${isInWishlist ? 'active' : ''}"></i> ${isInWishlist ? 'In Wishlist' : 'Add to Wishlist'}
                            </button>
                             <button class="btn-extra-action" onClick=${() => generateDescription(product)}>
                                <i class="fa-solid fa-wand-magic-sparkles"></i> AI Description
                            </button>
                            <button class="btn-extra-action" onClick=${handleVisualizeClick}>
                                <i class="fa-solid fa-vr-cardboard"></i> Visualize
                            </button>
                        </div>
                         ${(isGeneratingDesc || description || error) && html`
                            <div class="furnitech-description-container">
                                ${isGeneratingDesc && html`<div class="typing-indicator"><span></span><span></span><span></span></div>`}
                                ${description && html`<p class="furnitech-description-text">${description}</p>`}
                                ${error && html`<p class="furnitech-error-inline">${error}</p>`}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}


function ProductCatalogCard() {
    const { products } = useContext(AppContext);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [category, setCategory] = useState('All');
    const [priceRange, setPriceRange] = useState([0, 30000]);
    const [sort, setSort] = useState('default');
    const [displayedCount, setDisplayedCount] = useState(8);
    const [showFilters, setShowFilters] = useState(false);

    const fuse = useMemo(() => new Fuse(products, {
        keys: ['name', 'code', 'category', 'description'],
        threshold: 0.4,
    }), [products]);

    const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category))], [products]);

    const filteredProducts = useMemo(() => {
        let results = searchTerm ? fuse.search(searchTerm).map(r => r.item) : products;
        
        if (category !== 'All') {
            results = results.filter(p => p.category === category);
        }
        
        // FIX: Cast product price to number for comparison
        results = results.filter(p => Number(p.price) >= priceRange[0] && Number(p.price) <= priceRange[1]);
        
        switch (sort) {
            case 'price-asc':
                // FIX: Cast product prices to numbers for sorting
                results.sort((a, b) => Number(a.price) - Number(b.price));
                break;
            case 'price-desc':
                // FIX: Cast product prices to numbers for sorting
                results.sort((a, b) => Number(b.price) - Number(a.price));
                break;
            case 'name-asc':
                results.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        
        return results;
    }, [searchTerm, products, category, priceRange, sort, fuse]);

    const paginatedProducts = useMemo(() => filteredProducts.slice(0, displayedCount), [filteredProducts, displayedCount]);

    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.length > 2) {
            setSuggestions(fuse.search(value, { limit: 5 }).map(r => r.item));
        } else {
            setSuggestions([]);
        }
    };
    
    const selectSuggestion = (name) => {
        setSearchTerm(name);
        setSuggestions([]);
    };

    const loadMore = () => {
        setDisplayedCount(prev => prev + 12);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setCategory('All');
        setPriceRange([0, 30000]);
        setSort('default');
        setShowFilters(false);
    };
    
    return html`
        <div class="card product-catalog-card">
            <div class="product-grid-header">
                <div class="card-title-wrapper">
                    <div class="card-title-main">
                        <i class="fa-solid fa-store"></i>
                        <h2 class="card-title">Product Catalog</h2>
                    </div>
                </div>
                <div class="search-and-filter-wrapper">
                    <div class="search-bar">
                        <i class="fa-solid fa-search"></i>
                        <input type="text" placeholder="Search products..." value=${searchTerm} onInput=${handleSearchChange} />
                         ${suggestions.length > 0 && html`
                            <div class="autocomplete-suggestions">
                                ${suggestions.map(s => html`
                                    <div class="suggestion-item" onClick=${() => selectSuggestion(s.name)}>
                                        ${s.name}
                                    </div>
                                `)}
                            </div>
                        `}
                    </div>
                    <button class="btn btn-filter" onClick=${() => setShowFilters(!showFilters)}>
                        <i class="fa-solid fa-filter"></i> Filters ${showFilters ? html`<i class="fa-solid fa-chevron-up"></i>` : html`<i class="fa-solid fa-chevron-down"></i>`}
                    </button>
                </div>
            </div>
             ${showFilters && html`
                <div class="filter-panel">
                    <div class="filter-section">
                        <h4 class="filter-title">Category</h4>
                        <div class="filter-options">
                            ${categories.map(cat => html`
                                <button class="filter-option-btn ${category === cat ? 'active' : ''}" onClick=${() => setCategory(cat)}>${cat}</button>
                            `)}
                        </div>
                    </div>
                    <div class="filter-section">
                        <h4 class="filter-title">Sort By</h4>
                        <div class="filter-group">
                             <i class="fa-solid fa-arrow-down-wide-short"></i>
                             <select value=${sort} onChange=${e => setSort(e.target.value)}>
                                <option value="default">Default</option>
                                <option value="price-asc">Price: Low to High</option>
                                <option value="price-desc">Price: High to Low</option>
                                <option value="name-asc">Name: A-Z</option>
                            </select>
                        </div>
                    </div>
                    <div class="filter-panel-footer">
                        <button class="btn-link" onClick=${resetFilters}>Reset Filters</button>
                    </div>
                </div>
            `}
            
            <div class="product-list">
                ${paginatedProducts.map((product, index) => html`
                    <${ProductListItem} key=${product.code} product=${product} />
                    ${index === 5 && html`
                        <div class="quotation-wrapper-inline">
                            <${QuotationCard} />
                        </div>
                    `}
                `)}
            </div>

            ${filteredProducts.length === 0 && html`
                <div class="no-results">
                    <h3>No Products Found</h3>
                    <p>Try adjusting your search or filter criteria.</p>
                </div>
            `}
            
            ${displayedCount < filteredProducts.length && html`
                <div class="product-grid-footer">
                    <button class="btn" onClick=${loadMore}>Load More</button>
                </div>
            `}
        </div>
    `;
}

function ProductBundles() {
    const { products, setCart, currency } = useContext(AppContext);
    
    const calculateBundle = (bundle) => {
        let total = 0;
        const resolvedItems = [];
        bundle.items.forEach(item => {
            const product = products.find(p => p.code === item.code);
            if (product) {
                // FIX: Cast product price to number for calculation
                total += Number(product.price) * item.quantity;
                resolvedItems.push({ product, quantity: item.quantity });
            }
        });
        return { total, resolvedItems };
    };

    const handleAddBundleToCart = (bundle) => {
        const { resolvedItems } = calculateBundle(bundle);
        const cartItems = resolvedItems.map(item => ({
            ...item,
            id: Date.now() + Math.random(),
            selectedColor: item.product.colors ? item.product.colors[0] : null
        }));

        setCart(prev => [...prev, ...cartItems]);
    };
    
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-box-open"></i>
                    <h2 class="card-title">Product Bundles</h2>
                </div>
            </div>
            <div class="product-bundles-grid">
                ${productBundles.map(bundle => {
                    const { total, resolvedItems } = calculateBundle(bundle);
                    return html`
                        <div class="bundle-card" key=${bundle.id}>
                            <div class="bundle-info">
                                <h3 class="bundle-name">${bundle.name}</h3>
                                <p class="bundle-description">${bundle.description}</p>
                                <ul class="bundle-item-list">
                                    ${resolvedItems.map(item => html`
                                        <li><span>${item.quantity}x</span> ${item.product.name}</li>
                                    `)}
                                </ul>
                            </div>
                            <div class="bundle-footer">
                                <div class="bundle-price">
                                    <span>Package Price</span>
                                    <strong>${formatCurrency(total, currency)}</strong>
                                </div>
                                <button class="btn btn-primary" onClick=${() => handleAddBundleToCart(bundle)}>Add to Quote</button>
                            </div>
                        </div>
                    `;
                })}
            </div>
        </div>
    `;
}

// --- HOME OFFICE DESIGNER ---

function HomeOfficeDesigner() {
    const { products, currency, canvasItems, setCanvasItems, setCart } = useContext(AppContext);
    const canvasRef = useRef(null);
    const [activeDrag, setActiveDrag] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);

    const totalCost = useMemo(() => canvasItems.reduce((acc, item) => acc + Number(item.product.price), 0), [canvasItems]);

    const handlePaletteDragStart = (e, product) => {
        e.dataTransfer.setData('productCode', product.code);
    };

    const handleCanvasDragOver = (e) => {
        e.preventDefault();
    };

    const handleCanvasDrop = (e) => {
        e.preventDefault();
        const productCode = e.dataTransfer.getData('productCode');
        if (productCode && canvasRef.current) {
            const product = products.find(p => p.code === productCode);
            if (!product) return;

            const canvasRect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - canvasRect.left - 50; // Adjust for item width
            const y = e.clientY - canvasRect.top - 50;  // Adjust for item height

            const newItem = {
                id: Date.now(),
                product,
                x: Math.max(0, Math.min(x, canvasRect.width - 100)),
                y: Math.max(0, Math.min(y, canvasRect.height - 100)),
                rotation: 0,
            };
            setCanvasItems(prev => [...prev, newItem]);
        }
    };
    
    const handleItemMouseDown = (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedItem(item.id);
        const isRotateHandle = e.target.classList.contains('rotate-handle');

        setActiveDrag({
            id: item.id,
            isRotating: isRotateHandle,
            // For moving
            offsetX: e.clientX - item.x,
            offsetY: e.clientY - item.y,
            // For rotating
            startX: e.clientX,
            startY: e.clientY,
            startRotation: item.rotation,
            itemCenterX: item.x + 50, // Assuming 100px width
            itemCenterY: item.y + 50, // Assuming 100px height
        });
    };

    const handleMouseMove = useCallback((e) => {
        if (!activeDrag) return;

        if (activeDrag.isRotating) {
             const angle = Math.atan2(e.clientY - activeDrag.itemCenterY, e.clientX - activeDrag.itemCenterX);
             const degrees = angle * (180 / Math.PI);
             setCanvasItems(prev => prev.map(item => 
                item.id === activeDrag.id ? { ...item, rotation: degrees + 90 } : item
            ));
        } else {
            const newX = e.clientX - activeDrag.offsetX;
            const newY = e.clientY - activeDrag.offsetY;
            
            setCanvasItems(prev => prev.map(item =>
                item.id === activeDrag.id ? { ...item, x: newX, y: newY } : item
            ));
        }
    }, [activeDrag, setCanvasItems]);

    const handleMouseUp = useCallback(() => {
        setActiveDrag(null);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);
    
    const handleDeleteItem = (e, id) => {
        e.stopPropagation();
        setCanvasItems(prev => prev.filter(item => item.id !== id));
    };

    const handleAddAllToCart = () => {
        if (canvasItems.length === 0) return;
        
        const itemsToAdd = canvasItems.map(item => ({
            product: item.product,
            quantity: 1, // Or implement quantity logic
            id: Date.now() + Math.random(),
            selectedColor: item.product.colors ? item.product.colors[0] : null
        }));
        
        setCart(prev => {
            const newCart = [...prev];
            itemsToAdd.forEach(newItem => {
                const existingItemIndex = newCart.findIndex(cartItem => cartItem.product.code === newItem.product.code && cartItem.selectedColor?.hex === newItem.selectedColor?.hex);
                if (existingItemIndex > -1) {
                    newCart[existingItemIndex].quantity += 1;
                } else {
                    newCart.push(newItem);
                }
            });
            return newCart;
        });
    };

    const handleClearCanvas = () => {
        if (confirm('Are you sure you want to clear the canvas?')) {
            setCanvasItems([]);
        }
    };

    return html`
        <div class="card home-office-designer-card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-drafting-compass"></i>
                    <h2 class="card-title">Home Office Designer</h2>
                </div>
            </div>

            <div class="designer-toolbar">
                <div class="toolbar-info">
                    <span class="toolbar-label">Total Cost:</span>
                    <span class="toolbar-value">${formatCurrency(totalCost, currency)}</span>
                </div>
                <div class="toolbar-actions">
                    <button class="btn btn-secondary" onClick=${handleClearCanvas}><i class="fa-solid fa-trash-can"></i> Clear</button>
                    <button class="btn btn-primary" onClick=${handleAddAllToCart}><i class="fa-solid fa-cart-plus"></i> Add to Quote</button>
                </div>
            </div>
            
            <div class="designer-layout">
                <div class="product-palette">
                    ${products.map(p => html`
                        <div class="palette-item" draggable="true" onDragStart=${(e) => handlePaletteDragStart(e, p)}>
                            <img src=${p.imageUrl} alt=${p.name} />
                            <div class="palette-item-info">
                                <span class="palette-item-name">${p.name}</span>
                                <span class="palette-item-price">${formatCurrency(p.price, currency)}</span>
                            </div>
                        </div>
                    `)}
                </div>
                <div 
                    class="designer-canvas" 
                    ref=${canvasRef}
                    onDragOver=${handleCanvasDragOver}
                    onDrop=${handleCanvasDrop}
                    onClick=${() => setSelectedItem(null)}
                >
                     ${canvasItems.length === 0 && html`
                        <div class="canvas-placeholder">
                            <i class="fa-solid fa-arrow-pointer"></i>
                            <p>Drag products from the left panel and drop them here to start designing.</p>
                        </div>
                    `}
                    ${canvasItems.map(item => html`
                        <div 
                            class="canvas-item ${selectedItem === item.id ? 'selected' : ''}"
                            style=${{ transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)` }}
                            onMouseDown=${e => handleItemMouseDown(e, item)}
                        >
                            <img src=${item.product.imageUrl} alt=${item.product.name} draggable="false" />
                            <div class="item-controls">
                                <div class="control-handle rotate-handle" onMouseDown=${e => handleItemMouseDown(e, item)}><i class="fa-solid fa-arrows-rotate"></i></div>
                                <div class="control-handle delete-handle" onClick=${e => handleDeleteItem(e, item.id)}><i class="fa-solid fa-trash-can"></i></div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        </div>
    `;
}

// --- FURNITECH AI TOOLS ---

function FurnitechAssistantCard() {
    const { 
        furnitechAssistantHistory, 
        isFurnitechAssistantGenerating,
        furnitechAssistantError, 
        generateFurnitechResponse,
        chatSummary,
        setChatSummary,
        isSummarizing,
        summarizeChat,
        setModalUrl,
        products,
        currency,
        setCart
    } = useContext(AppContext);
    const [prompt, setPrompt] = useState('');
    const [useWebSearch, setUseWebSearch] = useState(false);
    const historyRef = useRef(null);

    useEffect(() => {
        if (historyRef.current) {
            historyRef.current.scrollTop = historyRef.current.scrollHeight;
        }
    }, [furnitechAssistantHistory, isFurnitechAssistantGenerating]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (prompt.trim() && !isFurnitechAssistantGenerating) {
            generateFurnitechResponse(prompt, useWebSearch);
            setPrompt('');
        }
    };
    
    const formatResponse = (text) => {
        const addProductToCart = (productCode) => {
            const product = products.find(p => p.code === productCode);
            if (product) {
                const selectedColor = product.colors ? product.colors[0] : null;
                const existingItem = useContext(AppContext).cart.find(item => item.product.code === product.code && item.selectedColor?.hex === selectedColor?.hex);
                if (existingItem) {
                    setCart(prev => prev.map(item => item.id === existingItem.id ? { ...item, quantity: item.quantity + 1 } : item));
                } else {
                    setCart(prev => [...prev, { product, quantity: 1, id: Date.now(), selectedColor }]);
                }
            }
        };

        const parts = text.split(/(\[\[PRODUCT:.*?\]\])/g);
        
        return parts.map(part => {
            const match = part.match(/\[\[PRODUCT:(.*?)\]\]/);
            if (match) {
                const productCode = match[1];
                const product = products.find(p => p.code === productCode);
                if (product) {
                    return html`
                        <div class="product-mention">
                            <div class="mention-info">
                                <p class="mention-name">${product.name}</p>
                                <p class="mention-price">${formatCurrency(product.price, currency)}</p>
                            </div>
                            <button class="btn-mention-add" onClick=${() => addProductToCart(product.code)}>
                                <i class="fa-solid fa-plus"></i> Add
                            </button>
                        </div>
                    `;
                }
                return html`<span class="product-mention-invalid">Invalid Product Code: ${productCode}</span>`;
            }
            
            return part
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .split('\n').map(line => html`<p>${line}</p>`);
        });
    };
    
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-comments"></i>
                    <h2 class="card-title">Furnitech Assistant</h2>
                </div>
                 ${furnitechAssistantHistory.length > 2 && !chatSummary && html`
                    <button class="btn btn-secondary" onClick=${summarizeChat} disabled=${isSummarizing}>
                        ${isSummarizing ? html`<div class="loading-spinner-small"></div>` : html`<i class="fa-solid fa-wand-magic-sparkles"></i>`}
                        Summarize
                    </button>
                 `}
            </div>
            ${chatSummary && html`
                <div class="chat-summary-container">
                    <div class="summary-header">
                        <h4><i class="fa-solid fa-circle-info"></i> Conversation Summary</h4>
                        <button class="btn-clear-summary" onClick=${() => setChatSummary(null)}>&times;</button>
                    </div>
                    <p class="summary-content">${chatSummary}</p>
                </div>
            `}
            <div class="furnitech-assistant-history" ref=${historyRef}>
                 ${furnitechAssistantHistory.length === 0 && !isFurnitechAssistantGenerating && html`
                    <div class="empty-chat">
                        <i class="fa-regular fa-comments"></i>
                        <h4>Ask me anything!</h4>
                        <p>e.g., "Recommend an ergonomic chair under ₱5000" or "Compare executive tables for a modern office."</p>
                    </div>
                 `}
                ${furnitechAssistantHistory.map((entry, index) => html`
                    <div class="chat-message ${entry.role}" key=${index}>
                        <div class="message-bubble">
                             <div class="formatted-furnitech-content">
                                ${entry.role === 'model' ? formatResponse(entry.text) : entry.text}
                            </div>
                            ${entry.role === 'model' && entry.sources && html`
                                <div class="grounding-sources">
                                    <h5 class="sources-title"><i class="fa-solid fa-globe"></i> Sources:</h5>
                                    <ul class="sources-list">
                                        ${entry.sources.map(source => html`
                                            <li><a href="#" onClick=${(e) => { e.preventDefault(); setModalUrl(source.web.uri); }}>${source.web.title}</a></li>
                                        `)}
                                    </ul>
                                </div>
                            `}
                        </div>
                    </div>
                `)}
                 ${isFurnitechAssistantGenerating && html`
                    <div class="chat-message model">
                         <div class="message-bubble">
                            <div class="typing-indicator"><span></span><span></span><span></span></div>
                         </div>
                    </div>
                 `}
            </div>
            ${furnitechAssistantError && html`<p class="furnitech-error">${furnitechAssistantError}</p>`}
            <form class="furnitech-assistant-form" onSubmit=${handleSubmit}>
                <div class="textarea-wrapper">
                    <textarea 
                        value=${prompt} 
                        onInput=${e => setPrompt(e.target.value)}
                        placeholder="Ask for recommendations, comparisons, etc."
                        rows="1"
                    ></textarea>
                     <div class="web-search-toggle">
                        <input type="checkbox" id="web-search" checked=${useWebSearch} onChange=${() => setUseWebSearch(!useWebSearch)} />
                        <label for="web-search"><i class="fa-solid fa-globe"></i> Web Search</label>
                    </div>
                </div>
                <button class="btn btn-primary" type="submit" disabled=${isFurnitechAssistantGenerating || !prompt.trim()}>
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    `;
}

function FurnitechSpacePlannerCard() {
    const { 
        isPlanning, planError, generateLayoutPlan,
        furnitechLayoutOptions, setFurnitechLayoutOptions,
        selectedLayoutIndex, setSelectedLayoutIndex,
        addLayoutToCart,
        currency
    } = useContext(AppContext);

    const [floorPlan, setFloorPlan] = useState(null);
    const [officeType, setOfficeType] = useState('Startup');
    const [numEmployees, setNumEmployees] = useState(10);
    const [style, setStyle] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        generateLayoutPlan({ floorPlan, officeType, numEmployees, style });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFloorPlan(file);
        }
    };

    const clearSelection = () => {
        setFurnitechLayoutOptions(null);
        setSelectedLayoutIndex(null);
    };

    const selectedLayout = selectedLayoutIndex !== null ? furnitechLayoutOptions?.[selectedLayoutIndex] : null;

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-ruler-combined"></i>
                    <h2 class="card-title">Furnitech Space Planner</h2>
                </div>
                ${(furnitechLayoutOptions || isPlanning) && html`
                    <button class="btn btn-secondary" onClick=${clearSelection}>
                        <i class="fa-solid fa-arrow-left"></i> Start Over
                    </button>
                `}
            </div>

            ${!furnitechLayoutOptions && !isPlanning && !selectedLayout && html`
                <p class="furnitech-feature-intro">Get AI-powered office layout suggestions. Provide your office details and optionally upload a floor plan image.</p>
                <form class="furnitech-planner-form" onSubmit=${handleSubmit}>
                    <div class="form-row">
                        <div class="form-group-planner">
                             <i class="fa-solid fa-building"></i>
                            <select id="officeType" value=${officeType} onChange=${e => setOfficeType(e.target.value)}>
                                <option>Startup</option>
                                <option>Corporate</option>
                                <option>Creative Agency</option>
                                <option>Tech Hub</option>
                                <option>Law Firm</option>
                                <option>Co-working Space</option>
                            </select>
                        </div>
                        <div class="form-group-planner">
                            <i class="fa-solid fa-users"></i>
                            <input type="number" id="numEmployees" value=${numEmployees} onInput=${e => setNumEmployees(e.target.value)} placeholder="Number of Employees" min="1" />
                        </div>
                    </div>
                     <div class="form-group-planner">
                        <i class="fa-solid fa-palette"></i>
                        <input type="text" id="style" value=${style} onInput=${e => setStyle(e.target.value)} placeholder="Optional: Specific style (e.g., minimalist, industrial)" />
                    </div>
                    <div class="file-upload-wrapper">
                        <label for="floorPlan" class="btn"><i class="fa-solid fa-upload"></i> Upload Floor Plan</label>
                        <input type="file" id="floorPlan" onChange=${handleFileChange} accept="image/*" />
                        ${floorPlan && html`
                            <div class="file-name-display">
                                <i class="fa-solid fa-file-image"></i>
                                <span class="file-name-text">${floorPlan.name}</span>
                                <button class="btn-clear-file" onClick=${() => setFloorPlan(null)}>&times;</button>
                            </div>
                        `}
                    </div>
                    <div class="furnitech-feature-actions">
                        <button class="btn btn-primary" type="submit" disabled=${isPlanning}>
                            ${isPlanning ? html`<div class="loading-spinner"></div>` : html`<i class="fa-solid fa-lightbulb"></i>`}
                            Generate Plan
                        </button>
                    </div>
                </form>
            `}
            
            ${isPlanning && !furnitechLayoutOptions && html`
                <div class="loading-indicator-box">
                    <div class="loading-spinner-dark"></div>
                    <p>Generating layout options... This may take a moment.</p>
                </div>
            `}

            ${planError && html`<p class="furnitech-error">${planError}</p>`}
            
            ${furnitechLayoutOptions && !selectedLayout && html`
                <div class="generated-plan-wrapper">
                    <h3 class="generated-plan-title">Choose a Layout Option</h3>
                    <div class="layout-options-grid">
                        ${furnitechLayoutOptions.map((layout, index) => html`
                            <div class="layout-option-card ${selectedLayoutIndex === index ? 'active' : ''}" onClick=${() => setSelectedLayoutIndex(index)}>
                                <div class="layout-option-details">
                                    <h4 class="option-title">${layout.name}</h4>
                                    <p class="option-description">${layout.description}</p>
                                </div>
                                <div class="option-cost">
                                    <span>Estimated Cost</span>
                                    <strong>${formatCurrency(layout.totalCost, currency)}</strong>
                                </div>
                            </div>
                        `)}
                         ${Array.from({ length: 3 - furnitechLayoutOptions.length }).map(() => html`
                             <div class="skeleton-layout-card">
                                <div class="skeleton-layout-details">
                                     <div class="skeleton skeleton-text" style=${{width: '60%'}}></div>
                                     <div class="skeleton skeleton-text" style=${{width: '90%'}}></div>
                                     <div class="skeleton skeleton-text" style=${{width: '80%'}}></div>
                                </div>
                             </div>
                         `)}
                    </div>
                </div>
            `}

            ${selectedLayout && html`
                <div class="layout-plan-display">
                    <div class="layout-plan-header">
                        <h3>${selectedLayout.name}</h3>
                    </div>
                     <div class="layout-plan-summary">
                        <div class="summary-item">
                            <span>Total Items</span>
                            <strong>${selectedLayout.totalItems}</strong>
                        </div>
                        <div class="summary-item">
                            <span>Estimated Cost</span>
                            <strong>${formatCurrency(selectedLayout.totalCost, currency)}</strong>
                        </div>
                    </div>
                    <div class="layout-plan-notes">
                        <strong>Rationale:</strong> ${selectedLayout.description}
                    </div>
                    <div class="layout-plan-zones">
                        ${selectedLayout.zones.map(zone => html`
                            <div class="zone-card">
                                <h4 class="zone-name"><i class="fa-solid fa-vector-square"></i> ${zone.name}</h4>
                                <ul class="furniture-list">
                                    ${zone.furniture.map(item => html`
                                        <li>
                                            <span class="furniture-qty">${item.quantity}x</span>
                                            <div class="furniture-details">
                                                <span class="furniture-name">${item.productName}</span>
                                                <span class="furniture-price">${item.productCode}</span>
                                            </div>
                                        </li>
                                    `)}
                                </ul>
                            </div>
                        `)}
                    </div>
                    <div class="layout-plan-actions">
                         <button class="btn btn-primary" onClick=${() => addLayoutToCart(selectedLayout)}>
                            <i class="fa-solid fa-cart-plus"></i> Add All Items to Quote
                        </button>
                    </div>
                </div>
            `}
        </div>
    `;
}

function FurnitechImageStudioCard() {
    const { 
        isGeneratingFurnitechImages, furnitechImageGenerationError, generateFurnitechImages, generatedFurnitechImages,
        isEditingFurnitechImage, furnitechImageEditingError, editFurnitechImage, editedFurnitechImageResults, setEditedFurnitechImageResults,
        initialStudioImage, setInitialStudioImage,
    } = useContext(AppContext);
    
    const [mode, setMode] = useState('generate'); // 'generate' or 'edit'
    const [prompt, setPrompt] = useState('A modern startup office with a mix of collaborative and quiet spaces.');
    const [officeType, setOfficeType] = useState('Startup');
    const [customStyle, setCustomStyle] = useState('');
    const [editPrompt, setEditPrompt] = useState('Add a coffee machine on the counter.');
    
    const handleSubmitGeneration = (e) => {
        e.preventDefault();
        const styleDesc = getStyleDescriptionForOfficeType(officeType, customStyle);
        const fullPrompt = `${prompt}, in the style of ${styleDesc}.`;
        generateFurnitechImages({ prompt: fullPrompt });
    };

    const handleStartEdit = (imageData) => {
        setInitialStudioImage(imageData);
        setMode('edit');
        setEditedFurnitechImageResults([]); // Clear previous edit results
    };

    const handleSubmitEdit = (e) => {
        e.preventDefault();
        if (initialStudioImage && editPrompt) {
            editFurnitechImage({ image: initialStudioImage, prompt: editPrompt });
        }
    };

    const clearAll = () => {
        setInitialStudioImage(null);
        setEditedFurnitechImageResults([]);
        setMode('generate');
    };

    return html`
         <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-camera-retro"></i>
                    <h2 class="card-title">Furnitech Image Studio</h2>
                </div>
                ${(generatedFurnitechImages.length > 0 || initialStudioImage) && html`
                    <button class="btn btn-secondary" onClick=${clearAll}>
                        <i class="fa-solid fa-arrow-left"></i> Start Over
                    </button>
                `}
            </div>
            
            ${!initialStudioImage && html`
                 <div class="studio-mode-toggle">
                    <button class="mode-btn ${mode === 'generate' ? 'active' : ''}" onClick=${() => setMode('generate')}>
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate
                    </button>
                    <button class="mode-btn" disabled>
                        <i class="fa-solid fa-pen-ruler"></i> Edit (Select an Image)
                    </button>
                </div>
            `}
           
            <div class="studio-form-container">
                 ${!initialStudioImage && mode === 'generate' && html`
                    <form class="furnitech-image-studio-form" onSubmit=${handleSubmitGeneration}>
                        <p class="furnitech-feature-intro">Create inspirational office design images from a text description.</p>
                         <div class="form-group-planner">
                             <i class="fa-solid fa-align-left"></i>
                            <textarea id="prompt" value=${prompt} onInput=${e => setPrompt(e.target.value)} placeholder="Describe the office scene..." rows="3"></textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group-planner">
                                <i class="fa-solid fa-building"></i>
                                <select id="officeType" value=${officeType} onChange=${e => setOfficeType(e.target.value)}>
                                    <option>Startup</option><option>Corporate</option><option>Creative Agency</option>
                                    <option>Tech Hub</option><option>Law Firm</option><option>Co-working Space</option>
                                </select>
                            </div>
                            <div class="form-group-planner">
                                <i class="fa-solid fa-palette"></i>
                                <input type="text" value=${customStyle} onInput=${e => setCustomStyle(e.target.value)} placeholder="Optional: custom style"/>
                            </div>
                        </div>
                        <div class="furnitech-feature-actions">
                             <button class="btn btn-primary" type="submit" disabled=${isGeneratingFurnitechImages}>
                                ${isGeneratingFurnitechImages ? html`<div class="loading-spinner"></div>` : html`<i class="fa-solid fa-image"></i>`}
                                Generate Image
                            </button>
                        </div>
                    </form>
                 `}
                 
                 ${initialStudioImage && mode === 'edit' && html`
                    <form class="furnitech-image-studio-form" onSubmit=${handleSubmitEdit}>
                        <p class="furnitech-feature-intro">Describe the changes you want to make to the selected image.</p>
                         <div class="result-image-wrapper">
                            <img src=${initialStudioImage.imageData} alt="Image to be edited" />
                            <span class="image-label">Original</span>
                        </div>
                        <div class="form-group-planner">
                             <i class="fa-solid fa-pen"></i>
                            <input type="text" value=${editPrompt} onInput=${e => setEditPrompt(e.target.value)} placeholder="e.g., Change the chairs to blue"/>
                        </div>
                        <div class="furnitech-feature-actions">
                             <button class="btn btn-primary" type="submit" disabled=${isEditingFurnitechImage}>
                                ${isEditingFurnitechImage ? html`<div class="loading-spinner"></div>` : html`<i class="fa-solid fa-wand-magic"></i>`}
                                Apply Edit
                            </button>
                        </div>
                    </form>
                 `}
            </div>

            ${isGeneratingFurnitechImages && html`
                <div class="results-wrapper">
                    <h3 class="result-title">Generating Your Vision...</h3>
                    <div class="generated-images-grid">
                        <div class="skeleton skeleton-image-card"></div>
                    </div>
                </div>
            `}

            ${furnitechImageGenerationError && html`<p class="furnitech-error">${furnitechImageGenerationError}</p>`}
            
            ${generatedFurnitechImages.length > 0 && !initialStudioImage && html`
                <div class="results-wrapper">
                    <h3 class="result-title">Generated Images</h3>
                    <div class="generated-images-grid">
                        ${generatedFurnitechImages.map((img, index) => html`
                            <div class="generated-image-card" key=${index}>
                                <img src=${img.imageData} alt="Generated office design" />
                                <div class="image-overlay">
                                    <button class="btn-download" onClick=${() => handleStartEdit(img)} data-tooltip="Edit Image">
                                        <i class="fa-solid fa-pen-ruler"></i>
                                    </button>
                                     <button class="btn-download" onClick=${() => downloadImage(img.imageData, `generated-${index}`)} data-tooltip="Download">
                                        <i class="fa-solid fa-download"></i>
                                    </button>
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            `}
            
            ${isEditingFurnitechImage && html`
                 <div class="results-wrapper">
                    <h3 class="result-title">Applying Your Edits...</h3>
                    <div class="batch-results-grid">
                        <div class="skeleton-result-card">
                            <div class="skeleton-result-pair">
                                <div class="skeleton skeleton-edit-image"></div>
                                <div class="skeleton skeleton-edit-image"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${furnitechImageEditingError && html`<p class="furnitech-error">${furnitechImageEditingError}</p>`}

            ${editedFurnitechImageResults.length > 0 && html`
                 <div class="results-wrapper">
                    <h3 class="result-title">Edited Image Result</h3>
                    <div class="batch-results-grid">
                        ${editedFurnitechImageResults.map((result, index) => html`
                            <div class="batch-result-card" key=${index}>
                                <div class="result-pair">
                                    <div class="result-image-wrapper">
                                        <img src=${result.original} alt="Original" />
                                        <span class="image-label">Original</span>
                                    </div>
                                    <div class="result-image-wrapper">
                                         ${result.edited ? html`
                                            <img src=${result.edited} alt="Edited" />
                                            <div class="image-overlay">
                                                <button class="btn-download" onClick=${() => downloadImage(result.edited, `edited-${index}`)} data-tooltip="Download">
                                                    <i class="fa-solid fa-download"></i>
                                                </button>
                                            </div>
                                         ` : html`
                                            <div class="result-error">
                                                <i class="fa-solid fa-triangle-exclamation"></i>
                                                <span>Could not generate an edit for this image.</span>
                                            </div>
                                         `}
                                        <span class="image-label">Edited</span>
                                    </div>
                                </div>
                                ${result.textResponse && html`<p class="edited-image-text">${result.textResponse}</p>`}
                            </div>
                        `)}
                    </div>
                </div>
            `}
        </div>
    `;
}

function FurnitechVideoStudioCard() {
    const { 
        isGeneratingFurnitechVideo, furnitechVideoGenerationError, furnitechVideoGenerationStatus,
        generateFurnitechVideo, generatedFurnitechVideoUrl 
    } = useContext(AppContext);
    
    const [prompt, setPrompt] = useState('A drone shot flying through a modern, spacious office with employees collaborating.');
    const [image, setImage] = useState(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        generateFurnitechVideo({ prompt, image });
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImage(file);
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
             <p class="furnitech-feature-intro">Create short video clips of office environments. Optionally provide an image to influence the starting frame.</p>

            ${!generatedFurnitechVideoUrl && !isGeneratingFurnitechVideo && html`
                <form class="furnitech-video-studio-form" onSubmit=${handleSubmit}>
                    <div class="form-group-planner">
                        <i class="fa-solid fa-align-left"></i>
                        <textarea value=${prompt} onInput=${e => setPrompt(e.target.value)} placeholder="Describe the video scene..." rows="3"></textarea>
                    </div>
                     <div class="file-upload-wrapper">
                        <label for="videoImage" class="btn"><i class="fa-solid fa-image"></i> Add Image (Optional)</label>
                        <input type="file" id="videoImage" onChange=${handleFileChange} accept="image/*" />
                        ${image && html`
                            <div class="file-name-display">
                                <i class="fa-solid fa-file-image"></i>
                                <span class="file-name-text">${image.name}</span>
                                <button class="btn-clear-file" onClick=${() => setImage(null)}>&times;</button>
                            </div>
                        `}
                    </div>
                    <div class="furnitech-feature-actions">
                        <button class="btn btn-primary" type="submit" disabled=${isGeneratingFurnitechVideo || !prompt.trim()}>
                             ${isGeneratingFurnitechVideo ? html`<div class="loading-spinner"></div>` : html`<i class="fa-solid fa-video"></i>`}
                            Generate Video
                        </button>
                    </div>
                </form>
            `}
            
            ${isGeneratingFurnitechVideo && html`
                <div class="loading-indicator-box">
                    <div class="loading-spinner-dark"></div>
                    <p>Generating video... This can take several minutes.</p>
                    ${furnitechVideoGenerationStatus && html`<p><strong>Status: ${furnitechVideoGenerationStatus}</strong></p>`}
                </div>
            `}

            ${furnitechVideoGenerationError && html`<p class="furnitech-error">${furnitechVideoGenerationError}</p>`}
            
            ${generatedFurnitechVideoUrl && html`
                <div class="generated-video-wrapper">
                     <h3 class="result-title">Generated Video</h3>
                    <video controls autoplay loop src=${generatedFurnitechVideoUrl}></video>
                    <a href=${generatedFurnitechVideoUrl} download="obra-furnitech-video.mp4" class="btn btn-primary btn-download-video">
                        <i class="fa-solid fa-download"></i> Download Video
                    </a>
                </div>
            `}
        </div>
    `;
}

function ProductVisualizerCard() {
    const { 
        isVisualizingProduct, visualizedProduct, visualizationResult,
        visualizeProduct, startVisualization, clearVisualization
    } = useContext(AppContext);
    const [scene, setScene] = useState('a modern home office with a large window');

    const handleVisualize = (e) => {
        e.preventDefault();
        if (visualizedProduct && scene) {
            visualizeProduct(visualizedProduct, scene);
        }
    };
    
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                 <div class="card-title-main">
                    <i class="fa-solid fa-vr-cardboard"></i>
                    <h2 class="card-title">Product Visualizer</h2>
                </div>
                ${visualizedProduct && html`
                    <button class="btn btn-secondary" onClick=${clearVisualization}>
                        <i class="fa-solid fa-xmark"></i> Clear
                    </button>
                `}
            </div>

            ${!visualizedProduct ? html`
                 <div class="visualizer-placeholder">
                    <i class="fa-regular fa-square"></i>
                    <h3>Visualize a Product in a Scene</h3>
                    <p>Select the "Visualize" option on any product in the catalog to get started.</p>
                </div>
            ` : html`
                <div class="visualizer-active-view">
                    <div class="visualizer-product-info">
                        <img src=${visualizedProduct.imageUrl} alt=${visualizedProduct.name} />
                        <div class="product-details">
                            <h4>${visualizedProduct.name}</h4>
                            <p>${visualizedProduct.code}</p>
                        </div>
                    </div>
                    <form onSubmit=${handleVisualize}>
                        <div class="form-group-planner">
                            <i class="fa-solid fa-mountain-sun"></i>
                            <input type="text" value=${scene} onInput=${e => setScene(e.target.value)} placeholder="Describe the background scene" />
                        </div>
                         <div class="visualizer-actions">
                            <button class="btn btn-primary" type="submit" disabled=${isVisualizingProduct}>
                                ${isVisualizingProduct ? html`<div class="loading-spinner"></div>` : html`<i class="fa-solid fa-eye"></i>`}
                                Place in Scene
                            </button>
                        </div>
                    </form>

                    ${isVisualizingProduct && html`
                         <div class="loading-indicator-box">
                            <div class="loading-spinner-dark"></div>
                            <p>Placing product in your scene...</p>
                        </div>
                    `}
                    
                    ${visualizationResult && html`
                        <div class="results-wrapper">
                            <h3 class="result-title">Visualization Result</h3>
                            <img src=${visualizationResult} class="visualizer-result-image" alt="Product visualized in scene" />
                        </div>
                    `}
                </div>
            `}
        </div>
    `;
}

function OnboardingModal({ onComplete }) {
    const features = [
        { icon: 'fa-solid fa-comments', title: 'Furnitech Assistant', description: 'Your AI-powered office design consultant. Get recommendations, ideas, and product comparisons instantly.' },
        { icon: 'fa-solid fa-ruler-combined', title: 'Space Planner', description: 'Receive intelligent layout suggestions tailored to your office type, size, and specific needs.' },
        { icon: 'fa-solid fa-camera-retro', title: 'Image Studio', description: 'Generate and edit photorealistic images of your ideal office space to bring your vision to life.' },
    ];
    const [step, setStep] = useState(0);

    return html`
        <div class="onboarding-overlay">
            <div class="onboarding-modal">
                <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Furnitech Logo" class="onboarding-logo" />
                <div class="onboarding-header">
                    <h1>Welcome to Furnitech</h1>
                    <p>The smartest way to design your office space.</p>
                </div>
                <div class="onboarding-progress">
                    ${features.map((_, index) => html`<div class="progress-dot ${index === step ? 'active' : ''}"></div>`)}
                </div>
                 <div class="onboarding-feature">
                    <div class="feature-icon-wrapper"><i class=${features[step].icon}></i></div>
                    <div class="feature-text">
                        <h2>${features[step].title}</h2>
                        <p>${features[step].description}</p>
                    </div>
                </div>
                <div class="onboarding-actions">
                     ${step < features.length - 1 ? html`
                        <button class="btn btn-primary" onClick=${() => setStep(step + 1)}>Next</button>
                        <button class="btn-link" onClick=${onComplete}>Skip for now</button>
                     ` : html`
                         <button class="btn btn-primary" onClick=${onComplete}>Get Started</button>
                     `}
                </div>
            </div>
        </div>
    `;
}

function Header() {
    return html`
        <header class="app-header">
            <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Furnitech Logo" class="header-logo" />
            <${HeaderControls} />
        </header>
    `;
}

function HeaderControls() {
    const { currency, setCurrency } = useContext(AppContext);
    return html`
        <div class="header-controls">
            <div class="currency-selector">
                <i class="fa-solid fa-coins"></i>
                <select value=${currency} onChange=${e => setCurrency(e.target.value)}>
                    ${Object.keys(currencyRates).map(c => html`<option value=${c}>${c}</option>`)}
                </select>
            </div>
        </div>
    `;
}

const MainContent = () => {
    return html`
        <main class="main-content">
            <div class="main-layout">
                <${CtaBanner} />
                <div class="content-section">
                    <div class="intro-cards">
                        <${ClientInfoCard} />
                        <${WishlistCard} />
                    </div>
                </div>
                <div class="content-section">
                    <${ProductCatalogCard} />
                </div>
                <div class="content-section">
                    <${ProductBundles} />
                </div>
                <div class="content-section">
                    <${HomeOfficeDesigner} />
                </div>
                <div class="content-section">
                     <h2 class="section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Furnitech AI Tools</h2>
                     <div class="furnitech-tools-grid">
                        <${FurnitechAssistantCard} />
                        <${FurnitechSpacePlannerCard} />
                        <${FurnitechImageStudioCard} />
                        <${FurnitechVideoStudioCard} />
                        <${ProductVisualizerCard} />
                     </div>
                </div>
            </div>
        </main>
    `;
};


function Footer() {
    return html`
        <footer>
            <div class="footer-content">
                 <p>&copy; ${new Date().getFullYear()} OBRA Furnitech. All rights reserved.</p>
                 <div class="footer-contact">
                    <a href="https://facebook.com/obraofficefurniture" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-facebook"></i> OBRA Office Furniture</a>
                    <a href="mailto:obrafurniture@gmail.com"><i class="fa-solid fa-envelope"></i> obrafurniture@gmail.com</a>
                    <span><i class="fa-brands fa-viber"></i> +63915 743 9188</span>
                    <span><i class="fa-solid fa-map-marker-alt"></i> 12 Santan, Quezon City, Philippines 1116</span>
                </div>
            </div>
        </footer>
    `;
}

function App() {
    const [cart, setCart] = useState([]);
    const [clientInfo, setClientInfo] = useState({ name: '', company: '', contact: '', email: '' });
    const [currency, setCurrency] = useState('PHP');
    const [wishlist, setWishlist] = useState([]);
    const [logoPng, setLogoPng] = useState(null);

    // AI Feature State
    const [generatedDescriptions, setGeneratedDescriptions] = useState({});
    const [generating, setGenerating] = useState({});
    const [generationError, setGenerationError] = useState({});
    const [furnitechLayoutOptions, setFurnitechLayoutOptions] = useState(null);
    const [selectedLayoutIndex, setSelectedLayoutIndex] = useState(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [planError, setPlanError] = useState('');
    const [furnitechAssistantHistory, setFurnitechAssistantHistory] = useState([]);
    const [isFurnitechAssistantGenerating, setIsFurnitechAssistantGenerating] = useState(false);
    const [furnitechAssistantError, setFurnitechAssistantError] = useState('');
    const [chatSummary, setChatSummary] = useState(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [modalUrl, setModalUrl] = useState(null);
    const [generatedFurnitechImages, setGeneratedFurnitechImages] = useState([]);
    const [isGeneratingFurnitechImages, setIsGeneratingFurnitechImages] = useState(false);
    const [furnitechImageGenerationError, setFurnitechImageGenerationError] = useState('');
    const [editedFurnitechImageResults, setEditedFurnitechImageResults] = useState([]);
    const [isEditingFurnitechImage, setIsEditingFurnitechImage] = useState(false);
    const [furnitechImageEditingError, setFurnitechImageEditingError] = useState('');
    const [generatedFurnitechVideoUrl, setGeneratedFurnitechVideoUrl] = useState(null);
    const [isGeneratingFurnitechVideo, setIsGeneratingFurnitechVideo] = useState(false);
    const [furnitechVideoGenerationError, setFurnitechVideoGenerationError] = useState('');
    const [furnitechVideoGenerationStatus, setFurnitechVideoGenerationStatus] = useState('');
    const [visualizedProduct, setVisualizedProduct] = useState(null);
    const [isVisualizingProduct, setIsVisualizingProduct] = useState(false);
    const [visualizationResult, setVisualizationResult] = useState(null);
    const [initialStudioImage, setInitialStudioImage] = useState(null);
    const [canvasItems, setCanvasItems] = useState([]);
    const [expandedProductCode, setExpandedProductCode] = useState(null);

    // Auth and onboarding
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(true);

    // Quotation extras
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState('PHP');
    const [deliveryFee, setDeliveryFee] = useState(0);

    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

    useEffect(() => {
        convertSvgToPng(`data:image/svg+xml;base64,${obraLogo}`).then(setLogoPng);
    }, []);

    const generateDescription = useCallback(async (product) => {
        setGenerating(prev => ({ ...prev, [product.code]: true }));
        setGenerationError(prev => ({ ...prev, [product.code]: null }));
        try {
            const prompt = `Create a compelling, one-paragraph marketing description for an office furniture product. Product name: "${product.name}". Category: "${product.category}". Existing description: "${product.description}". Price point is around ${formatCurrency(product.price, "PHP")}. Focus on benefits like productivity, comfort, and style. Keep it concise and professional.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            setGeneratedDescriptions(prev => ({ ...prev, [product.code]: response.text }));
        } catch (error) {
            console.error('Error generating description:', error);
            setGenerationError(prev => ({ ...prev, [product.code]: 'Failed to generate description.' }));
        } finally {
            setGenerating(prev => ({ ...prev, [product.code]: false }));
        }
    }, [ai]);

    const generateLayoutPlan = useCallback(async ({ floorPlan, officeType, numEmployees, style }) => {
        setIsPlanning(true);
        setPlanError('');
        setFurnitechLayoutOptions(null);
        setSelectedLayoutIndex(null);
        try {
            const productList = initialProducts.map(p => `- ${p.code}: ${p.name} (${p.category}) - ${formatCurrency(p.price, 'PHP')}`).join('\n');
            const styleDesc = getStyleDescriptionForOfficeType(officeType, style);
            
            const prompt = `
                As an expert office layout designer, create 2-3 distinct layout plans for an office with the following requirements:
                - Office Type: ${officeType}
                - Number of Employees: ${numEmployees}
                - Desired Style: ${styleDesc}
                - Available Products (do not use products not on this list):
                ${productList}

                For each plan, provide:
                1. A short, catchy name (e.g., "Collaborative Hub", "Executive Focus Suite").
                2. A brief rationale explaining the design choice.
                3. A list of zones (e.g., "Main Work Area," "Meeting Room," "Lounge").
                4. For each zone, list the specific furniture items required using their product codes and names, along with quantities.
            `;
            
            const schema = {
                type: Type.OBJECT,
                properties: {
                    layouts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                description: { type: Type.STRING },
                                zones: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            name: { type: Type.STRING },
                                            furniture: {
                                                type: Type.ARRAY,
                                                items: {
                                                    type: Type.OBJECT,
                                                    properties: {
                                                        productCode: { type: Type.STRING },
                                                        productName: { type: Type.STRING },
                                                        quantity: { type: Type.INTEGER }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });

            const parsedResponse = JSON.parse(response.text);

            const layoutsWithCosts = parsedResponse.layouts.map(layout => {
                let totalCost = 0;
                let totalItems = 0;
                layout.zones.forEach(zone => {
                    zone.furniture.forEach(item => {
                        const product = initialProducts.find(p => p.code === item.productCode);
                        if (product) {
                            // FIX: Cast product price to number for calculation
                            totalCost += Number(product.price) * item.quantity;
                        }
                        totalItems += item.quantity;
                    });
                });
                return { ...layout, totalCost, totalItems };
            });

            setFurnitechLayoutOptions(layoutsWithCosts);

        } catch (error) {
            console.error('Error generating layout plan:', error);
            setPlanError('Failed to generate layout options. Please try again.');
        } finally {
            setIsPlanning(false);
        }
    }, [ai]);
    
    const addLayoutToCart = useCallback((layout) => {
        const itemsToAdd = [];
        layout.zones.forEach(zone => {
            zone.furniture.forEach(item => {
                const product = initialProducts.find(p => p.code === item.productCode);
                if (product) {
                    const selectedColor = product.colors ? product.colors[0] : null;
                    itemsToAdd.push({
                        product,
                        quantity: item.quantity,
                        id: Date.now() + Math.random(),
                        selectedColor
                    });
                }
            });
        });
        setCart(prev => [...prev, ...itemsToAdd]);
        setFurnitechLayoutOptions(null);
        setSelectedLayoutIndex(null);
    }, [setCart]);

    const generateFurnitechResponse = useCallback(async (prompt, useWebSearch) => {
        setIsFurnitechAssistantGenerating(true);
        setFurnitechAssistantError('');
        const currentHistory = [...furnitechAssistantHistory, { role: 'user', text: prompt }];
        setFurnitechAssistantHistory(currentHistory);

        try {
            const productList = initialProducts.map(p => `code: ${p.code}, name: ${p.name}, category: ${p.category}, price: ${formatCurrency(p.price, 'PHP')}`).join('; ');
            const systemInstruction = `You are OBRA Furnitech's helpful AI assistant. Your goal is to help users choose the best office furniture. You are knowledgeable about the product catalog: [${productList}]. When you recommend a product, wrap its product code in [[PRODUCT:CODE]] format, for example: [[PRODUCT:OBET-528fJ]]. Do not invent products. Be friendly and professional.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [...currentHistory.map(m => ({ role: m.role, parts: [{ text: m.text }]})), { role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction,
                    ...(useWebSearch && { tools: [{ googleSearch: {} }] })
                }
            });
            
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
            const sources = groundingMetadata?.groundingChunks?.filter(c => c.web).map(c => c.web);

            setFurnitechAssistantHistory(prev => [...prev, { role: 'model', text: response.text, sources }]);
        } catch (error) {
            console.error('Error with Furnitech Assistant:', error);
            setFurnitechAssistantError('Sorry, I encountered an error. Please try again.');
        } finally {
            setIsFurnitechAssistantGenerating(false);
        }
    }, [ai, furnitechAssistantHistory]);
    
    const summarizeChat = useCallback(async () => {
        setIsSummarizing(true);
        try {
            const conversation = furnitechAssistantHistory.map(m => `${m.role}: ${m.text}`).join('\n');
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Summarize the key points and user preferences from this conversation in one or two sentences: \n\n${conversation}`
            });
            setChatSummary(response.text);
        } catch (error) {
            console.error('Error summarizing chat:', error);
        } finally {
            setIsSummarizing(false);
        }
    }, [ai, furnitechAssistantHistory]);
    
    const generateFurnitechImages = useCallback(async ({ prompt }) => {
        setIsGeneratingFurnitechImages(true);
        setFurnitechImageGenerationError('');
        setGeneratedFurnitechImages([]);
        try {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/png' },
            });
            const images = response.generatedImages.map(img => ({
                imageData: `data:image/png;base64,${img.image.imageBytes}`,
                mimeType: 'image/png'
            }));
            setGeneratedFurnitechImages(images);
        } catch (error) {
            console.error('Error generating images:', error);
            setFurnitechImageGenerationError('Failed to generate image. Please try a different prompt.');
        } finally {
            setIsGeneratingFurnitechImages(false);
        }
    }, [ai]);

    const editFurnitechImage = useCallback(async ({ image, prompt }) => {
        setIsEditingFurnitechImage(true);
        setFurnitechImageEditingError('');
        setEditedFurnitechImageResults([]);
        try {
            const base64Data = image.imageData.split(',')[1];
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: {
                    parts: [
                        { inlineData: { data: base64Data, mimeType: image.mimeType } },
                        { text: prompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            
            let editedImage = null;
            let textResponse = '';
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    editedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                } else if (part.text) {
                    textResponse = part.text;
                }
            }
            
            setEditedFurnitechImageResults([{ original: image.imageData, edited: editedImage, textResponse }]);
        } catch (error) {
            console.error('Error editing image:', error);
            setFurnitechImageEditingError('Failed to edit image. The model may not be able to fulfill this request.');
        } finally {
            setIsEditingFurnitechImage(false);
        }
    }, [ai]);

    const generateFurnitechVideo = useCallback(async ({ prompt, image }) => {
        setIsGeneratingFurnitechVideo(true);
        setFurnitechVideoGenerationError('');
        setGeneratedFurnitechVideoUrl(null);
        setFurnitechVideoGenerationStatus('Initializing...');
        try {
            let imagePart = undefined;
            if (image) {
                const base64String = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    // FIX: Cast reader.result to string to use split
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(image);
                });
                imagePart = { imageBytes: base64String, mimeType: image.type };
            }

            let operation = await ai.models.generateVideos({
                model: 'veo-2.0-generate-001',
                prompt,
                ...(imagePart && { image: imagePart }),
                config: { numberOfVideos: 1 }
            });

            setFurnitechVideoGenerationStatus('Processing request...');
            
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation });
                const progress = operation.metadata?.progressPercentage || 0;
                // FIX: Cast progress to number before calling toFixed
                setFurnitechVideoGenerationStatus(`Rendering video... ${(progress as number).toFixed(0)}%`);
            }
            
            if (operation.response) {
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                const blob = await response.blob();
                const videoUrl = URL.createObjectURL(blob);
                setGeneratedFurnitechVideoUrl(videoUrl);
            } else {
                 throw new Error('Video generation finished but no video was returned.');
            }

        } catch (error) {
            console.error('Error generating video:', error);
            setFurnitechVideoGenerationError('Failed to generate video. Please try again.');
        } finally {
            setIsGeneratingFurnitechVideo(false);
            setFurnitechVideoGenerationStatus('');
        }
    }, [ai]);

    const startVisualization = (product) => {
        setVisualizedProduct(product);
        setVisualizationResult(null);
        // Scroll to the visualizer card if it's far
        document.querySelector('.card-title-main i.fa-vr-cardboard')?.closest('.card').scrollIntoView({ behavior: 'smooth' });
    };

    const clearVisualization = () => {
        setVisualizedProduct(null);
        setVisualizationResult(null);
    };

    const visualizeProduct = useCallback(async (product, sceneDescription) => {
        setIsVisualizingProduct(true);
        setVisualizationResult(null);
        try {
            const productImageUrl = product.imageUrl;
            const response = await fetch(productImageUrl);
            const blob = await response.blob();
            // FIX: Type the promise to ensure base64Data is a string
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                // FIX: Cast reader.result to string to use split
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            
            const prompt = `Realistically place the following product into this scene: "${sceneDescription}". The product should be the main focus. Maintain correct lighting and perspective.`;

            const editResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: {
                    parts: [
                        { inlineData: { data: base64Data, mimeType: blob.type } },
                        { text: prompt },
                    ],
                },
                config: { responseModalities: [Modality.IMAGE] },
            });
            
            const imagePart = editResponse.candidates[0].content.parts.find(p => p.inlineData);
            if (imagePart) {
                setVisualizationResult(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
            } else {
                throw new Error("Visualization failed to return an image.");
            }
        } catch (error) {
            console.error('Error in product visualization:', error);
        } finally {
            setIsVisualizingProduct(false);
        }
    }, [ai]);

    const contextValue = {
        products: initialProducts,
        cart, setCart,
        clientInfo, setClientInfo,
        currency, setCurrency,
        generatedDescriptions, generating, generationError, generateDescription,
        furnitechLayoutOptions, setFurnitechLayoutOptions,
        selectedLayoutIndex, setSelectedLayoutIndex,
        isPlanning, planError, generateLayoutPlan, addLayoutToCart,
        furnitechAssistantHistory, isFurnitechAssistantGenerating, furnitechAssistantError, generateFurnitechResponse,
        chatSummary, setChatSummary, isSummarizing, summarizeChat,
        modalUrl, setModalUrl,
        generatedFurnitechImages, isGeneratingFurnitechImages, furnitechImageGenerationError, generateFurnitechImages,
        editedFurnitechImageResults, setEditedFurnitechImageResults, isEditingFurnitechImage, setIsEditingFurnitechImage: isEditingFurnitechImage, furnitechImageEditingError, editFurnitechImage,
        wishlist, setWishlist,
        generatedFurnitechVideoUrl, isGeneratingFurnitechVideo, furnitechVideoGenerationError, furnitechVideoGenerationStatus, generateFurnitechVideo,
        isAuthenticated, setIsAuthenticated, showAuthModal, setShowAuthModal,
        isVisualizingProduct, visualizedProduct, visualizationResult, visualizeProduct, startVisualization, clearVisualization,
        initialStudioImage, setInitialStudioImage,
        discount, setDiscount, discountType, setDiscountType, deliveryFee, setDeliveryFee,
        logoPng,
        canvasItems, setCanvasItems,
        expandedProductCode, setExpandedProductCode,
    };

    return html`
        <${AppContext.Provider} value=${contextValue}>
            ${showOnboarding && html`<${OnboardingModal} onComplete=${() => setShowOnboarding(false)} />`}
            ${showAuthModal && html`<${AuthModal} onAuthSuccess=${() => { setIsAuthenticated(true); setShowAuthModal(false); }} />`}
            ${modalUrl && html`<${WebsiteModal} url=${modalUrl} onClose=${() => setModalUrl(null)} />`}
            <div class="container">
                <${Header} />
                <${MainContent} />
            </div>
            <${Footer} />
        </${AppContext.Provider}>
    `;
}

render(html`<${App} />`, document.getElementById('root'));