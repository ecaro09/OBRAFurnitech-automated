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

// Base64 encoded OBRA Office Furniture logo
const obraLogo = "PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDMwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHN0eWxlPi50aXRsZSB7IGZvbnQtZmFtaWx5OiAnUGxheWZhaXIgRGlzcGxheScsIHNlcmlmOyBmb250LXNpemU6IDYwcHg7IGZvbnQtd2VpZ2h0OiA3MDA7IHRleHQtYW5jaG9yOiBtaWRkbGU7IH0uc3VidGl0bGUgeyBmb250LWZhbWlseTogJ01vbnRzZXJyYXQnLCBzYW5zLXNlcmlmOyBmb250LXN0eWxlOiBpdGFsaWM7IGZvbnQtc2lzeTogMjRweDsgdGV4dC1yYW5jaG9yOiBtaWRkbGU7IH08L3N0eWxlPjx0ZXh0IHg9IjE1MCIgeT0iNDUiIGNsYXNzPSJ0aXRsZSIgZmlsbD0iYmxhY2siPk9CUkE8L3RleHQ+PHRleHQgeD0iMTUwIiB5PSI4MCIgYmxhc3M9InN1YnRpdGxlIiBmaWxsPSJibGFjayI+T2ZmaWNlIEZ1cm5pdHVyZTwvdGV4dD48L3N2Zz4=";

// --- Data (Updated from OBRA Catalog CSV without image URLs) ---
const initialProducts = [
    {"code":"22-FB03-EGC WHT 1.6m","name":"L-Type Executive Glass Top Table","category":"Executive Tables","dimensions":"L160cm x W80cm x H75cm","price":"21778","description":"12mm tempered glass, melamine front panel, aluminium alloy frame."},
    {"code":"22-FB04-EGC BLK 1.8m","name":"L-Type Executive Glass Top Table","category":"Executive Tables","dimensions":"L180cm x W90cm x H75cm","price":"25888","description":"12mm tempered black glass, melamine front panel, steel frame."},
    {"code":"22-FB01-EMD 2.0m","name":"Executive Melamine Desk","category":"Executive Tables","dimensions":"L200cm x W100cm x H75cm","price":"18500","description":"High-quality melamine finish, with side cabinet, modern design."},
    {"code":"83-A12","name":"High-Back Ergonomic Chair","category":"Office Chairs","dimensions":"-","price":"8750","description":"Mesh back, adjustable lumbar support, 3D armrests, synchronized mechanism."},
    {"code":"83-A15","name":"Mid-Back Mesh Chair","category":"Office Chairs","dimensions":"-","price":"6500","description":"Breathable mesh back, fixed armrests, tilt mechanism."},
    {"code":"83-C01","name":"Visitor's Cantilever Chair","category":"Office Chairs","dimensions":"-","price":"3200","description":"Fabric upholstery, chrome cantilever base."},
    {"code":"OD-4P-WS 1.2m","name":"4-Person Office Workstation","category":"Workstations","dimensions":"L240cm x W120cm x H105cm","price":"15600","description":"Melamine top, fabric panel dividers, shared legs."},
    {"code":"OD-6P-WS 1.4m","name":"6-Person Office Workstation","category":"Workstations","dimensions":"L420cm x W120cm x H105cm","price":"22800","description":"Includes 6 tables with partitions, cable management ready."},
    {"code":"GC-803","name":"3-Drawer Mobile Pedestal","category":"Storage","dimensions":"L40cm x W48cm x H60cm","price":"4500","description":"Melamine finish, centralized lock, on castors."},
    {"code":"SF-210-L","name":"Low-Height Steel Filing Cabinet","category":"Storage","dimensions":"L90cm x W45cm x H102cm","price":"7800","description":"2 shelves, swinging glass doors, powder-coated steel."},
    {"code":"SF-210-F","name":"Full-Height Steel Filing Cabinet","category":"Storage","dimensions":"L90cm x W45cm x H185cm","price":"9500","description":"4 shelves, swinging steel doors with lock."},
    {"code":"CT-GLS-100","name":"Round Glass Conference Table","category":"Conference Tables","dimensions":"D100cm x H75cm","price":"9800","description":"10mm tempered glass top, chrome steel base, seats 4."},
    {"code":"CT-REC-240","name":"Rectangular Conference Table","category":"Conference Tables","dimensions":"L240cm x W120cm x H75cm","price":"16500","description":"Melamine top with steel legs, includes center grommet for wiring, seats 8-10."},
    {"code":"SOFA-1S","name":"Single Seater Sofa","category":"Sofas & Lounges","dimensions":"L85cm x W80cm x H78cm","price":"7900","description":"Fabric upholstery, solid wood frame, high-density foam."},
    {"code":"SOFA-3S","name":"Three Seater Sofa","category":"Sofas & Lounges","dimensions":"L195cm x W80cm x H78cm","price":"15500","description":"Matching three-seater for reception or lounge areas."}
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
    aiLayoutOptions: null,
    selectedLayoutIndex: null,
    setSelectedLayoutIndex: (value: any) => {},
    isPlanning: false,
    planError: '',
    generateLayoutPlan: async (options: any) => {},
    aiAssistantHistory: [],
    isAssistantGenerating: false,
    assistantError: '',
    generateAiResponse: async (prompt: string) => {},
});

const formatCurrency = (amount, currency) => {
    const { symbol } = currencyRates[currency];
    const value = Number(amount) * currencyRates[currency].rate;
    return `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function ProductCard({ product }) {
    const { cart, setCart, currency, generatedDescriptions, generating, generationError, generateDescription } = useContext(AppContext);

    const isGenerating = generating[product.code];
    const description = generatedDescriptions[product.code];
    const error = generationError[product.code];

    const addToCart = () => {
        setCart(prevCart => {
            const existingItem = prevCart.find(item => item.code === product.code);
            if (existingItem) {
                return prevCart.map(item =>
                    item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1 }];
        });
    };

    const handleGenerate = () => {
        if (!isGenerating) {
            generateDescription(product);
        }
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
                <div class="product-footer">
                    <p class="product-price">${formatCurrency(product.price, currency)}</p>
                    <button onClick=${addToCart} class="btn btn-primary" aria-label="Add ${product.name} to cart" data-tooltip="Add to Cart">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                </div>
            </div>
            <div class="product-ai-actions">
                <button onClick=${handleGenerate} disabled=${isGenerating} class="btn-ai-generate" aria-label="Generate AI description for ${product.name}">
                     ${isGenerating ? html`<div class="loading-spinner-small"></div> Generating...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Description`}
                </button>
            </div>
            ${ (description || error) && html`
                <div class="ai-description-container">
                    ${error && html`<p class="ai-error-inline">${error}</p>`}
                    ${description && html`<p class="ai-description-text">${description}</p>`}
                </div>
            `}
        </div>
    `;
}

function ProductGrid() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [sortOrder, setSortOrder] = useState('default');
    const [priceRange, setPriceRange] = useState('All');
    const [suggestions, setSuggestions] = useState([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isGeneratingCatalog, setIsGeneratingCatalog] = useState(false);
    const { currency } = useContext(AppContext);

    const categories = useMemo(() => ['All', ...new Set(initialProducts.map(p => p.category))], []);

    const priceRanges = {
        'All': [0, Infinity],
        'Under ₱10,000': [0, 9999.99],
        '₱10,000 - ₱20,000': [10000, 20000],
        'Over ₱20,000': [20000.01, Infinity],
    };

    const fuse = useMemo(() => new Fuse(initialProducts, {
        keys: ['name', 'code', 'category', 'description'],
        threshold: 0.4,
    }), [initialProducts]);

    const filteredAndSortedProducts = useMemo(() => {
        let products = initialProducts;

        if (searchQuery) {
            products = fuse.search(searchQuery).map(result => result.item);
        }

        if (selectedCategory !== 'All') {
            products = products.filter(p => p.category === selectedCategory);
        }
        
        if (priceRange !== 'All') {
            const [min, max] = priceRanges[priceRange];
            products = products.filter(p => {
                const price = Number(p.price);
                return price >= min && price <= max;
            });
        }

        const sorted = [...products];
        if (sortOrder === 'price-asc') {
            sorted.sort((a, b) => Number(a.price) - Number(b.price));
        } else if (sortOrder === 'price-desc') {
            sorted.sort((a, b) => Number(b.price) - Number(a.price));
        } else if (sortOrder === 'name-asc') {
            sorted.sort((a, b) => a.name.localeCompare(b.name));
        }

        return sorted;
    }, [searchQuery, selectedCategory, sortOrder, priceRange, fuse]);

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

    const generateCatalogPdf = () => {
        setIsGeneratingCatalog(true);
        const doc = new jsPDF();

        // Header
        doc.addImage(`data:image/svg+xml;base64,${obraLogo}`, 'SVG', 14, 12, 60, 20);
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
        setIsGeneratingCatalog(false);
    };

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <div class="card-title-main">
                    <i class="fa-solid fa-store"></i>
                    <h2 class="card-title">Product Catalog</h2>
                </div>
                <button onClick=${generateCatalogPdf} disabled=${isGeneratingCatalog} class="btn">
                    ${isGeneratingCatalog ? html`<div class="loading-spinner-dark"></div>` : html`<i class="fa-solid fa-file-pdf"></i>`} Download Catalog
                </button>
            </div>
            <div class="search-controls">
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
                <div class="filter-group">
                    <i class="fa-solid fa-tags"></i>
                    <select value=${selectedCategory} onChange=${e => setSelectedCategory(e.target.value)} aria-label="Filter by category">
                        ${categories.map(cat => html`<option value=${cat}>${cat}</option>`)}
                    </select>
                </div>
                <div class="filter-group">
                    <i class="fa-solid fa-dollar-sign"></i>
                    <select value=${priceRange} onChange=${e => setPriceRange(e.target.value)} aria-label="Filter by price range">
                        ${Object.keys(priceRanges).map(range => html`<option value=${range}>${range}</option>`)}
                    </select>
                </div>
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

function ProductMention({ productCode }) {
    const { setCart, currency } = useContext(AppContext);
    const product = initialProducts.find(p => p.code === productCode);

    if (!product) {
        return html`<span class="product-mention-invalid">Invalid SKU: ${productCode}</span>`;
    }

    const addToCart = () => {
        setCart(prevCart => {
            const existingItem = prevCart.find(item => item.code === product.code);
            if (existingItem) {
                return prevCart.map(item =>
                    item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevCart, { ...product, quantity: 1 }];
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

function FormattedAIResponse({ text }) {
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

    return html`<div class="formatted-ai-content">${content}</div>`;
}

function AIAssistant() {
    const {
        aiAssistantHistory,
        isAssistantGenerating,
        assistantError,
        generateAiResponse
    } = useContext(AppContext);

    const [prompt, setPrompt] = useState('');
    const historyRef = useRef(null);

    useEffect(() => {
        if (historyRef.current) {
            historyRef.current.scrollTop = historyRef.current.scrollHeight;
        }
    }, [aiAssistantHistory]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (prompt.trim() && !isAssistantGenerating) {
            generateAiResponse(prompt);
            setPrompt('');
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
                <i class="fa-solid fa-comments-dollar"></i>
                <h2 class="card-title">AI Assistant</h2>
            </div>
            <p class="ai-assistant-intro">
                Ask for product recommendations, design ideas, or anything else.
            </p>
            <div class="ai-assistant-history" ref=${historyRef}>
                ${aiAssistantHistory.length === 0 && html`
                    <div class="empty-chat">
                        <i class="fa-solid fa-robot"></i>
                        <p>Ready to help you build the perfect office!</p>
                    </div>
                `}
                ${aiAssistantHistory.map((msg, index) => html`
                    <div key=${index} class="chat-message ${msg.role}">
                        <div class="message-bubble">
                            ${msg.role === 'model' ? html`<${FormattedAIResponse} text=${msg.content} />` : msg.content}
                        </div>
                    </div>
                `)}
                ${isAssistantGenerating && html`
                    <div class="chat-message model">
                        <div class="message-bubble">
                            <div class="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                `}
            </div>
            ${assistantError && html`<p class="ai-error-inline">${assistantError}</p>`}
            <form class="ai-assistant-form" onSubmit=${handleSubmit}>
                <textarea
                    value=${prompt}
                    onInput=${e => setPrompt(e.target.value)}
                    placeholder="e.g., 'Suggest a chair for long hours...'"
                    rows="2"
                    aria-label="Ask the AI assistant"
                    onKeyDown=${handleKeyDown}
                ></textarea>
                <button type="submit" class="btn btn-primary" disabled=${isAssistantGenerating || !prompt.trim()}>
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </form>
        </div>
    `;
}

function LayoutOptionsDisplay({ options, selectedIndex, onSelect }) {
    return html`
        <div class="layout-options-grid">
            ${options.map((option, index) => html`
                <div 
                    class=${`layout-option-card ${selectedIndex === index ? 'active' : ''}`}
                    onClick=${() => onSelect(index)}
                    key=${index}
                    aria-label=${`Select layout option: ${option.title}`}
                    role="button"
                    tabindex="0"
                >
                    <div class="layout-option-visual">
                         ${option.isVisualGenerating ? html`
                            <div class="visual-loading">
                                <div class="loading-spinner-dark"></div>
                                <span>Generating visual...</span>
                            </div>
                        ` : option.visualRepresentationUrl ? html`
                            <img src=${option.visualRepresentationUrl} alt=${`Visual for ${option.title}`} />
                        ` : option.visualGenerationError ? html`
                            <div class="visual-error">
                                <i class="fa-solid fa-circle-exclamation"></i>
                                <span>${option.visualGenerationError}</span>
                            </div>
                        ` : html`
                            <div class="visual-placeholder">
                                <i class="fa-solid fa-image"></i>
                            </div>
                        `}
                    </div>
                    <div class="layout-option-details">
                        <h4 class="option-title">${option.title}</h4>
                        <p class="option-description">${option.description}</p>
                    </div>
                    <div class="option-cost">
                        <span>Est. Total Cost</span>
                        <strong>${option.totalEstimatedCost}</strong>
                    </div>
                </div>
            `)}
        </div>
    `;
}

function LayoutPlanDisplay({ plan }) {
    const { setCart, currency } = useContext(AppContext);
    const findProduct = (code) => initialProducts.find(p => p.code.toLowerCase() === code.toLowerCase());

    const handleAddAllToQuote = () => {
        if (!plan || !plan.zones) return;
        
        if (!confirm("This will clear your current quotation and replace it with items from this plan. Continue?")) {
            return;
        }

        const newCart = [];
        const productMap = new Map();

        plan.zones.forEach(zone => {
            zone.suggestedFurniture.forEach(item => {
                const product = findProduct(item.productCode);
                if (product) {
                    if (productMap.has(product.code)) {
                        productMap.set(product.code, productMap.get(product.code) + item.qty);
                    } else {
                        productMap.set(product.code, item.qty);
                    }
                }
            });
        });

        productMap.forEach((quantity, code) => {
            const product = findProduct(code);
            if (product) {
                newCart.push({ ...product, quantity });
            }
        });

        setCart(newCart);
    };

    return html`
        <div class="layout-plan-display">
            <div class="layout-plan-header">
                <h3>${plan.title || 'Generated Office Layout Plan'}</h3>
            </div>
            ${plan.visualRepresentationUrl && html`
                <div class="layout-plan-visual">
                    <img src=${plan.visualRepresentationUrl} alt=${`Visual for ${plan.title}`} />
                </div>
            `}
            <div class="layout-plan-summary">
                <div class="summary-item">
                    <span>Est. Total Cost</span>
                    <strong>${plan.totalEstimatedCost}</strong>
                </div>
                <div class="summary-item">
                    <span>Price Range</span>
                    <strong>${plan.priceRange || 'N/A'}</strong>
                </div>
            </div>
            <div class="layout-plan-notes">
                <p><strong>Designer's Notes:</strong> ${plan.notes}</p>
            </div>
            <div class="layout-plan-zones">
                ${plan.zones.map(zone => html`
                    <div class="zone-card" key=${zone.name}>
                        <h4 class="zone-name"><i class="fa-solid fa-vector-square"></i> ${zone.name}</h4>
                        <p class="zone-dims">Dimensions: ${zone.dimensions || 'N/A'}</p>
                        <ul class="furniture-list">
                            ${zone.suggestedFurniture.map(item => {
                                const product = findProduct(item.productCode);
                                return html`
                                    <li key=${item.productCode}>
                                        <span class="furniture-qty">${item.qty}x</span>
                                        <div class="furniture-details">
                                            <span class="furniture-name">${product ? product.name : item.productCode}</span>
                                            <span class="furniture-price">${product ? formatCurrency(product.price, currency) : 'Price not found'}</span>
                                        </div>
                                    </li>
                                `;
                            })}
                        </ul>
                    </div>
                `)}
            </div>
             <div class="layout-plan-actions">
                <button class="btn btn-primary" onClick=${handleAddAllToQuote}>
                    <i class="fa-solid fa-file-import"></i> Add All to Quotation
                </button>
            </div>
        </div>
    `;
}

function AISpacePlanner() {
    const { generateLayoutPlan, isPlanning, planError, aiLayoutOptions, selectedLayoutIndex, setSelectedLayoutIndex } = useContext(AppContext);
    const [prompt, setPrompt] = useState('');
    const [teamSize, setTeamSize] = useState('');
    const [budget, setBudget] = useState('');
    const [style, setStyle] = useState('');
    const [floorplanFile, setFloorplanFile] = useState(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!isPlanning) {
            generateLayoutPlan({
                userPrompt: prompt,
                teamSize,
                budget,
                style,
                file: floorplanFile
            });
        }
    };
    
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setFloorplanFile(file);
        } else {
            setFloorplanFile(null);
        }
    }
    
    const clearFile = () => {
        setFloorplanFile(null);
        const fileInput = document.getElementById('floorplan-upload');
        if (fileInput) {
            (fileInput as HTMLInputElement).value = '';
        }
    }

    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <i class="fa-solid fa-drafting-compass"></i>
                <h2 class="card-title">AI Space Planner</h2>
            </div>
            <p class="ai-assistant-intro">
                Describe your office needs, upload a floorplan, and let our AI generate layout options for you.
            </p>
            <form class="ai-planner-form" onSubmit=${handleSubmit}>
                <div class="form-row">
                    <div class="form-group-planner">
                         <i class="fa-solid fa-users"></i>
                         <input type="number" value=${teamSize} onInput=${e => setTeamSize(e.target.value)} placeholder="Team Size" />
                    </div>
                    <div class="form-group-planner">
                        <i class="fa-solid fa-tag"></i>
                        <input type="number" value=${budget} onInput=${e => setBudget(e.target.value)} placeholder="Budget (PHP)" />
                    </div>
                </div>
                <div class="form-group-planner">
                    <i class="fa-solid fa-palette"></i>
                    <input type="text" value=${style} onInput=${e => setStyle(e.target.value)} placeholder="Preferred Style (e.g., Modern, Open-plan)" />
                </div>
                <textarea
                    value=${prompt}
                    onInput=${e => setPrompt(e.target.value)}
                    placeholder="Add any specific notes or requirements here..."
                    rows="3"
                    aria-label="Additional Notes"
                ></textarea>
                <div class="file-upload-wrapper">
                    <label for="floorplan-upload" class="btn">
                        <i class="fa-solid fa-upload"></i> Upload Floorplan
                    </label>
                    <input type="file" id="floorplan-upload" onChange=${handleFileChange} accept="image/*" />
                    ${floorplanFile && html`
                        <div class="file-name-display">
                            <span>${floorplanFile.name}</span>
                            <button type="button" class="btn-clear-file" onClick=${clearFile}>&times;</button>
                        </div>
                    `}
                </div>
                <div class="ai-assistant-actions">
                    <button type="submit" class="btn btn-primary" disabled=${isPlanning}>
                        ${isPlanning ? html`<div class="loading-spinner"></div> Planning...` : html`<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Layouts`}
                    </button>
                </div>
            </form>
            ${planError && html`<p class="ai-error">${planError}</p>`}
            ${aiLayoutOptions && aiLayoutOptions.length > 0 && html`
                <div class="generated-plan-wrapper">
                    <h3 class="generated-plan-title">We've generated some layout options for you:</h3>
                    <${LayoutOptionsDisplay} 
                        options=${aiLayoutOptions} 
                        selectedIndex=${selectedLayoutIndex} 
                        onSelect=${(index) => setSelectedLayoutIndex(index)} 
                    />
                    ${selectedLayoutIndex !== null && aiLayoutOptions[selectedLayoutIndex] && html`
                        <${LayoutPlanDisplay} plan=${aiLayoutOptions[selectedLayoutIndex]} />
                    `}
                </div>
            `}
        </div>
    `;
}

function Quotation() {
    const { cart, setCart, clientInfo, currency } = useContext(AppContext);
    const [discount, setDiscount] = useState(0);
    const [discountType, setDiscountType] = useState('percent'); // 'percent' or 'fixed'
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);

    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cart]);

    const discountAmount = useMemo(() => {
        if (discountType === 'percent') {
            return subtotal * (discount / 100);
        }
        return Math.min(subtotal, discount);
    }, [subtotal, discount, discountType]);
    
    const total = useMemo(() => (subtotal - discountAmount) + Number(deliveryFee), [subtotal, discountAmount, deliveryFee]);

    const updateQuantity = (code, delta) => {
        setCart(prevCart => prevCart.map(item =>
            item.code === code ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        ));
    };
    
    const removeItem = (code) => {
        setCart(prevCart => prevCart.filter(item => item.code !== code));
    };

    const generatePdf = () => {
        setIsGenerating(true);
        setPdfUrl(null);
        
        const doc = new jsPDF();
        const issueDate = new Date().toLocaleDateString('en-US');
        const quoteNumber = `QTE-${Date.now()}`;

        // Header
        doc.addImage(`data:image/svg+xml;base64,${obraLogo}`, 'SVG', 14, 12, 60, 20);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text("OBRA Office Furniture", 196, 15, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.text("Satellite: 12 Santan, Bagbag, Quezon City, PH", 196, 20, { align: 'right' });
        doc.text("Warehouse: Judge Juan Luna, Roosevelt, Quezon City", 196, 25, { align: 'right' });
        doc.text("Email: obrafurniture@gmail.com", 196, 30, { align: 'right' });
        doc.text("Viber/WhatsApp: +63 915 743 9188", 196, 35, { align: 'right' });
        doc.text("FB: facebook.com/obraofficefurniture", 196, 40, { align: 'right' });
        
        // Quotation Title
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text("QUOTATION", 14, 50);
        
        // Client Info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Quote #: ${quoteNumber}`, 14, 60);
        doc.text(`Date: ${issueDate}`, 14, 65);
        
        doc.setFont('helvetica', 'bold');
        doc.text("Bill To:", 130, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(clientInfo.name || "N/A", 130, 65);
        doc.text(clientInfo.company || "N/A", 130, 70);
        doc.text(clientInfo.contact || "N/A", 130, 75);
        doc.text(clientInfo.email || "N/A", 130, 80);

        // Table
        const head = [['SKU', 'Product Name', 'Qty', 'Unit Price', 'Total']];
        const body = cart.map(item => ([
            item.code,
            item.name,
            item.quantity,
            formatCurrency(item.price, currency),
            formatCurrency(item.price * item.quantity, currency)
        ]));

        autoTable(doc, {
            head,
            body,
            startY: 90,
            theme: 'striped',
            headStyles: { fillColor: [22, 22, 22] },
        });

        // Totals
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        const rightAlign = 196;
        doc.setFontSize(10);
        doc.text("Subtotal:", 140, finalY);
        doc.text(formatCurrency(subtotal, currency), rightAlign, finalY, { align: 'right' });

        doc.text("Discount:", 140, finalY + 5);
        doc.text(`-${formatCurrency(discountAmount, currency)}`, rightAlign, finalY + 5, { align: 'right' });

        doc.text("Subtotal Less Discount:", 140, finalY + 10);
        doc.text(formatCurrency(subtotal - discountAmount, currency), rightAlign, finalY + 10, { align: 'right' });
        
        doc.text("Delivery Fee:", 140, finalY + 15);
        doc.text(formatCurrency(deliveryFee, currency), rightAlign, finalY + 15, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text("Total:", 140, finalY + 20);
        doc.text(formatCurrency(total, currency), rightAlign, finalY + 20, { align: 'right' });

        // Footer / Terms
        const pageHeight = doc.internal.pageSize.getHeight();
        const footerY = pageHeight - 30;
        doc.setLineWidth(0.2);
        doc.line(14, footerY, 196, footerY);
        doc.setFontSize(8);
        doc.text("Terms & Conditions:", 14, footerY + 8);
        doc.text("1. Prices are valid for 30 days. 2. Delivery is 15-30 working days upon receipt of Purchase Order. 3. Warranty: 1 year on parts and services.", 14, footerY + 13);
        doc.setFont('helvetica', 'bold');
        doc.text("Thank you for your business!", 196, footerY + 8, { align: 'right' });
        
        // Generate and show modal
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
        setIsGenerating(false);
    };
    
    const closeModal = () => {
        if(pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }
        setPdfUrl(null);
    }
    
    return html`
        <div class="card">
            <div class="card-title-wrapper">
                <i class="fa-solid fa-file-invoice-dollar"></i>
                <h2 class="card-title">Quotation</h2>
            </div>
            <div class="cart-items">
                ${cart.length === 0 ? html`
                    <div class="empty-cart">
                        <i class="fa-solid fa-basket-shopping"></i>
                        <p>Your quotation is empty.</p>
                        <p>Add products from the catalog to get started.</p>
                    </div>
                ` : cart.map(item => html`
                    <div class="cart-item" key=${item.code}>
                        <div class="item-details">
                            <p class="item-name">${item.name}</p>
                            <p class="item-price">${item.quantity} x ${formatCurrency(item.price, currency)}</p>
                        </div>
                        <div class="item-controls">
                            <button class="btn-quantity" onClick=${() => updateQuantity(item.code, -1)} aria-label="Decrease quantity">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <span class="item-quantity">${item.quantity}</span>
                            <button class="btn-quantity" onClick=${() => updateQuantity(item.code, 1)} aria-label="Increase quantity">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button class="btn-delete" onClick=${() => removeItem(item.code)} data-tooltip="Remove Item" aria-label="Remove ${item.name} from cart">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `)}
            </div>
            ${cart.length > 0 && html`
                <div class="summary-divider"></div>
                <div class="summary-extras">
                    <div class="summary-line-item-input">
                        <label for="discount">Discount</label>
                        <div class="input-group">
                            <input type="number" id="discount" value=${discount} onInput=${e => setDiscount(Math.max(0, e.target.value))} />
                             <div class="discount-toggle">
                                <button class=${`toggle-btn ${discountType === 'percent' ? 'active' : ''}`} onClick=${() => setDiscountType('percent')}>%</button>
                                <button class=${`toggle-btn ${discountType === 'fixed' ? 'active' : ''}`} onClick=${() => setDiscountType('fixed')}>${currencyRates[currency].symbol}</button>
                            </div>
                        </div>
                    </div>
                    <div class="summary-line-item-input">
                        <label for="delivery">Delivery Fee</label>
                        <div class="delivery-fee-group">
                            <span>${currencyRates[currency].symbol}</span>
                            <input type="number" id="delivery" value=${deliveryFee} onInput=${e => setDeliveryFee(Math.max(0, e.target.value))} />
                        </div>
                    </div>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-total">
                    <div class="summary-line-item">
                        <span>Subtotal</span>
                        <span>${formatCurrency(subtotal, currency)}</span>
                    </div>
                    <div class="summary-line-item">
                        <span>Discount</span>
                        <span>-${formatCurrency(discountAmount, currency)}</span>
                    </div>
                    <div class="summary-line-item">
                        <span><strong>TOTAL</strong></span>
                        <span><strong>${formatCurrency(total, currency)}</strong></span>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn btn-primary" onClick=${generatePdf} disabled=${isGenerating || !clientInfo.name}>
                        ${isGenerating ? html`<div class="loading-spinner"></div> Generating...` : 'Preview & Generate PDF'}
                    </button>
                </div>
            `}
        </div>
        
        ${pdfUrl && html`
            <div class="modal-overlay" onClick=${closeModal}>
                <div class="modal-content" onClick=${e => e.stopPropagation()}>
                    <div class="modal-header">
                        <h2>Quotation Preview</h2>
                        <button class="modal-close-btn" onClick=${closeModal} aria-label="Close modal">&times;</button>
                    </div>
                    <div class="modal-body">
                       <iframe src=${pdfUrl} title="Quotation PDF Preview"></iframe>
                    </div>
                    <div class="modal-footer">
                        <button class="btn" onClick=${closeModal}>Close</button>
                        <a href=${pdfUrl} download=${`Quotation-${clientInfo.company || clientInfo.name}.pdf`} class="btn btn-primary">
                            <i class="fa-solid fa-download"></i> Download PDF
                        </a>
                    </div>
                </div>
            </div>
        `}
    `;
}

function App() {
    const [cart, setCart] = useState([]);
    const [clientInfo, setClientInfo] = useState({ name: '', company: '', contact: '', email: '' });
    const [currency, setCurrency] = useState('PHP');
    const [generatedDescriptions, setGeneratedDescriptions] = useState({});
    const [generating, setGenerating] = useState({});
    const [generationError, setGenerationError] = useState({});
    const [aiLayoutOptions, setAiLayoutOptions] = useState(null);
    const [selectedLayoutIndex, setSelectedLayoutIndex] = useState(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [planError, setPlanError] = useState('');
    const [aiAssistantHistory, setAiAssistantHistory] = useState([]);
    const [isAssistantGenerating, setIsAssistantGenerating] = useState(false);
    const [assistantError, setAssistantError] = useState('');

    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

    const generateDescription = useCallback(async (product) => {
        setGenerating(prev => ({ ...prev, [product.code]: true }));
        setGenerationError(prev => ({ ...prev, [product.code]: null }));

        const prompt = `You are a professional B2B copywriter for OBRA Office Furniture. Your goal is to write a compelling, concise (2-3 sentences) product description for office managers and interior designers.

Focus on tangible benefits that resonate with this audience:
1.  **Highlight Durability & Value:** Use the provided 'Features' to emphasize the product's high-quality materials (e.g., 'tempered glass', 'steel frame'), solid build, and long-term value as a smart investment.
2.  **Solve Business Problems:** Explain how the product creates a more efficient, collaborative, or stylish workspace. Emphasize space-saving designs, productivity-boosting features, or its ability to elevate the office aesthetic.

Product Name: ${product.name}
Category: ${product.category}
Dimensions: ${product.dimensions}
Features: ${product.description}`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const text = response.text;
            setGeneratedDescriptions(prev => ({ ...prev, [product.code]: text }));
        } catch (error) {
            console.error("AI description generation failed:", error);
            setGenerationError(prev => ({ ...prev, [product.code]: "Failed to generate description. Please try again." }));
        } finally {
            setGenerating(prev => ({ ...prev, [product.code]: false }));
        }
    }, [ai]);

    const generateAiResponse = useCallback(async (prompt) => {
        setIsAssistantGenerating(true);
        setAssistantError('');
        const newHistory = [...aiAssistantHistory, { role: 'user', content: prompt }];
        setAiAssistantHistory(newHistory);

        const systemInstruction = `You are a helpful and friendly AI assistant for OBRA Office Furniture. Your expertise is in office furniture, interior design, and space planning. 
Your primary tasks are:
1.  Answer general questions about office design, furniture, and our products.
2.  Provide product recommendations from the catalog based on user needs.
3.  Give detailed information about specific products when asked.

**Interaction Rules:**
- Be professional and conversational.
- When a user asks for details about a specific product (e.g., "Tell me more about the L-Type Executive Glass Top Table"), use the provided 'Features' and 'Dimensions' from the catalog to give a comprehensive answer. Summarize the key features, materials, and dimensions clearly.
- CRITICAL: When you recommend a specific product from the catalog, you MUST wrap its SKU in brackets like this: [SKU:PRODUCT_CODE]. For example, 'I recommend the High-Back Ergonomic Chair [SKU:83-A12] for your needs.'`;
        
        const catalogData = initialProducts.map(p => `SKU: ${p.code} | Name: ${p.name} | Category: ${p.category} | Price: ${p.price} PHP | Dimensions: ${p.dimensions} | Features: ${p.description}`).join('\n');
        const cartSummary = cart.map(item => `${item.quantity}x ${item.name} (${item.code})`).join(', ');

        const fullPrompt = `
Here is the OBRA product catalog:
${catalogData}

Current items in quotation: ${cartSummary || 'None'}

Current conversation history:
${newHistory.map(entry => `${entry.role}: ${entry.content}`).join('\n')}

Based on all this information, provide a helpful response to the latest user query.
`;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: fullPrompt,
                config: { systemInstruction }
            });
            const text = response.text;
            setAiAssistantHistory(prev => [...prev, { role: 'model', content: text }]);
        } catch (error) {
            console.error("AI Assistant generation failed:", error);
            setAssistantError("Sorry, I couldn't process that request. Please try again.");
        } finally {
            setIsAssistantGenerating(false);
        }
    }, [ai, aiAssistantHistory, cart]);

    const generateLayoutPlan = useCallback(async (options) => {
        setIsPlanning(true);
        setPlanError('');
        setAiLayoutOptions(null);
        setSelectedLayoutIndex(null);

        const { userPrompt, teamSize, budget, style, file } = options;

        const fileToPart = async (file) => {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                    if (typeof reader.result === 'string') {
                        resolve(reader.result.split(',')[1]);
                    } else {
                        reject(new Error('Failed to read file as Data URL'));
                    }
                };
                reader.onerror = error => reject(error);
            });
            return {
                inlineData: {
                    mimeType: file.type,
                    data: base64
                }
            };
        };

        const systemInstruction = `You are an expert interior designer and office space planner for OBRA Furnitech.
Your goal is to generate THREE distinct office layout options based on the user's request and optional floorplan.
CRITICAL: You must exclusively use products from the official OBRA Furnitech product catalog provided. For every piece of furniture, you must use the exact product code (SKU) from the catalog. Do not invent products or codes.
Each option must have a unique theme (e.g., one focused on collaboration, one on quiet productivity, one that is budget-conscious).
Provide a creative title and a brief 1-2 sentence description for each option that highlights its main benefit.
Consider dimensions, ergonomics, collaboration, and the client's specific requirements for all options.
Always include estimated pricing based on OBRA catalog prices.

For each layout option, the 'notes' field is critical. It must contain a detailed 'Design Rationale' that explains:
- The thinking behind the layout.
- Why specific furniture was chosen from the catalog.
- How the design addresses the user's specific needs (team size, style, budget).
- A brief description of furniture placement within each zone.`;
        
        const catalogData = initialProducts.map(p => `SKU: ${p.code} | Name: ${p.name} | Category: ${p.category} | Price: ${p.price} PHP | Features: ${p.description}`).join('\n');
        
        const textPrompt = `
Here is the OBRA Furnitech product catalog for your reference:
${catalogData}

Please analyze the user's requirements below and generate a layout plan with three distinct options.

**Client Requirements:**
- **Team Size:** ${teamSize || 'Not specified'}
- **Budget:** ${budget ? `Approx. ${currencyRates['PHP'].symbol}${Number(budget).toLocaleString()}` : 'Not specified'}
- **Preferred Style:** ${style || 'Not specified'}
- **Additional Notes:** ${userPrompt || 'None'}
- **Floorplan:** ${file ? 'Provided in the attached image.' : 'No floorplan provided. Suggest general, flexible layouts.'}

Return the result strictly in the specified JSON format. The 'totalEstimatedCost' and 'priceRange' must be strings in PHP (e.g., "₱175,500"). Ensure the 'notes' field includes a comprehensive 'Design Rationale' explaining your design choices, furniture selection, and placement as per the system instructions.
`;
        
        const layoutSchema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "A creative, short title for the layout option (e.g., 'The Collaboration Hub')." },
                description: { type: Type.STRING, description: "A brief 1-2 sentence summary of this layout's concept and benefits." },
                zones: {
                    type: Type.ARRAY,
                    description: 'A list of distinct zones in the office layout.',
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING, description: 'e.g., "Reception Area", "Workstations"' },
                            dimensions: { type: Type.STRING, description: 'Estimated dimensions, e.g., "4m x 5m"' },
                            suggestedFurniture: {
                                type: Type.ARRAY,
                                description: 'List of furniture for this zone.',
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        productCode: { type: Type.STRING, description: 'The exact SKU from the catalog.' },
                                        qty: { type: Type.INTEGER, description: 'Quantity of this item.' }
                                    },
                                    required: ["productCode", "qty"]
                                }
                            }
                        },
                        required: ["name", "suggestedFurniture"]
                    }
                },
                totalEstimatedCost: { type: Type.STRING, description: 'The total estimated cost as a formatted string (e.g., "₱xxx,xxx").' },
                priceRange: { type: Type.STRING, description: 'A suggested price range as a formatted string (e.g., "₱xxx,xxx - ₱xxx,xxx").' },
                notes: { type: Type.STRING, description: "A detailed 'Design Rationale' explaining the layout's concept, furniture choices, how it addresses user needs, and includes a description of furniture placement within each zone." }
            },
            required: ["title", "description", "zones", "totalEstimatedCost", "notes"]
        };

        const schema = {
            type: Type.OBJECT,
            properties: {
                layouts: {
                    type: Type.ARRAY,
                    description: "An array of 3 distinct office layout design options.",
                    items: layoutSchema
                }
            },
            required: ["layouts"]
        };

        try {
            // Step 1: Generate the text-based layout plans
            const textPart = { text: textPrompt };
            const contentParts: any[] = [textPart];
            
            if (file) {
                const imagePart = await fileToPart(file);
                contentParts.push(imagePart);
            }

            const textResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: contentParts },
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            const jsonStr = textResponse.text.trim();
            const cleanedJsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
            const layoutData = JSON.parse(cleanedJsonStr);
            
            if (layoutData.layouts && layoutData.layouts.length > 0) {
                // Step 2: Set initial layout data and then generate visuals for each
                const layoutsWithPlaceholders = layoutData.layouts.map(layout => ({
                    ...layout,
                    visualRepresentationUrl: null,
                    isVisualGenerating: true,
                    visualGenerationError: null,
                }));
                setAiLayoutOptions(layoutsWithPlaceholders);
                setSelectedLayoutIndex(0);

                // Generate a visual for each layout option concurrently
                layoutsWithPlaceholders.forEach(async (layout, index) => {
                    try {
                        const visualPrompt = `Based on the provided floor plan, generate a simple, clean 2D top-down sketch illustrating the furniture placement for the following office layout. The sketch should be stylish and professional, like an architectural drawing.

Layout Title: ${layout.title}
Designer's Notes & Placement Details: "${layout.notes}"
Key Furniture & Zones:
${layout.zones.map(zone => `- ${zone.name}: ${zone.suggestedFurniture.map(f => `${f.qty}x ${f.productCode}`).join(', ')}`).join('\n')}

Focus on a clear visual representation of the described layout.`;

                        const visualContentParts: any[] = [{ text: visualPrompt }];
                        if (file) {
                            const imagePart = await fileToPart(file);
                            visualContentParts.unshift(imagePart); // Image part first for context
                        }

                        const imageResponse = await ai.models.generateContent({
                            model: 'gemini-2.5-flash-image-preview',
                            contents: { parts: visualContentParts },
                            config: {
                                responseModalities: [Modality.IMAGE, Modality.TEXT],
                            },
                        });

                        let imageUrl = null;
                        for (const part of imageResponse.candidates[0].content.parts) {
                            if (part.inlineData) {
                                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                                break;
                            }
                        }

                        if (!imageUrl) throw new Error('No image was generated by the model.');

                        setAiLayoutOptions(prevOptions => {
                            const newOptions = [...(prevOptions || [])];
                            if (newOptions[index]) {
                                newOptions[index] = { ...newOptions[index], visualRepresentationUrl: imageUrl, isVisualGenerating: false };
                            }
                            return newOptions;
                        });

                    } catch (error) {
                        console.error(`Visual generation failed for layout '${layout.title}':`, error);
                        setAiLayoutOptions(prevOptions => {
                            const newOptions = [...(prevOptions || [])];
                            if(newOptions[index]) {
                                newOptions[index] = { ...newOptions[index], isVisualGenerating: false, visualGenerationError: 'Visual failed.' };
                            }
                            return newOptions;
                        });
                    }
                });

            } else {
                throw new Error("AI response did not contain valid layout options.");
            }

        } catch (error) {
            console.error("AI layout generation failed:", error);
            setPlanError("Sorry, I encountered an issue generating the layout options. The model may be busy or the request could not be processed. Please try again.");
        } finally {
            setIsPlanning(false);
        }
    }, [ai]);
    
    const contextValue = {
        cart, setCart,
        clientInfo, setClientInfo,
        currency, setCurrency,
        generatedDescriptions,
        generating,
        generationError,
        generateDescription,
        aiLayoutOptions,
        selectedLayoutIndex,
        setSelectedLayoutIndex,
        isPlanning,
        planError,
        generateLayoutPlan,
        aiAssistantHistory,
        isAssistantGenerating,
        assistantError,
        generateAiResponse,
    };

    return html`
        <${AppContext.Provider} value=${contextValue}>
            <div class="container">
                <header>
                    <img src="data:image/svg+xml;base64,${obraLogo}" alt="OBRA Office Furniture Logo" class="header-logo" />
                     <div class="currency-selector">
                        <i class="fa-solid fa-coins"></i>
                        <label for="currency-select">Currency:</label>
                        <select id="currency-select" value=${currency} onChange=${(e) => setCurrency(e.target.value)}>
                            ${Object.keys(currencyRates).map(c => html`<option value=${c}>${c}</option>`)}
                        </select>
                    </div>
                </header>
                <main class="main-layout">
                    <div class="content-section">
                        <${ProductGrid} />
                    </div>
                    <aside>
                        <${ClientInfoForm} />
                        <${AIAssistant} />
                        <${AISpacePlanner} />
                        <${Quotation} />
                    </aside>
                </main>
            </div>
             <footer>
                <div class="footer-content">
                    <p>&copy; ${new Date().getFullYear()} OBRA Office Furniture. All rights reserved.</p>
                     <div class="footer-contact">
                        <span><i class="fa-solid fa-phone"></i> +63 915 743 9188</span>
                        <span><i class="fa-solid fa-envelope"></i> obrafurniture@gmail.com</span>
                        <a href="https://facebook.com/obraofficefurniture" target="_blank"><i class="fa-brands fa-facebook"></i> /OBRAOFFICEFURNITURE</a>
                    </div>
                </div>
            </footer>
        </${AppContext.Provider}>
    `;
}

render(html`<${App} />`, document.getElementById('root'));