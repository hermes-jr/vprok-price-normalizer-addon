/* Switch to true for verbosity */
let VPNA_DEBUG = false;

let elementToObserve = window.document.getElementById('catalogItems');

/* Searching for product quantity and multiplier in its title */
const multiplierMarkerRegex = 'пак|уп|шт';
const unitRegex = 'шт|мг|г|кг|мл|л|рулон(ов|а)?|пар[ы|а]?';
const quantityRegex = new RegExp('((?<mul1>\\d+)(?:' + multiplierMarkerRegex +
    ')\\*)?(?<quantity>\\d+(?:[\\.,]\\d+)?)\\s*(?<unit>' + unitRegex + ')(\\*(?<mul2>\\d+)(?:' +
    multiplierMarkerRegex + '))?(?:\\s|$)', '');

/* Conversion table */
const unificationTable = new Map([
    ['мг', [1000, 'г']],
    ['г', [1000, 'кг']],
    ['кг', [1, 'кг']],
    ['шт', [1, 'шт']],
    ['мл', [1000, 'л']],
    ['л', [1, 'л']],
    ['рулон', [1, 'рулон']],
    ['рулона', [1, 'рулон']],
    ['рулонов', [1, 'рулон']],
    ['пар', [1, 'пара']],
    ['пара', [1, 'пара']],
    ['пары', [1, 'пара']],
]);
const defaultConvRule = [1.0, 'шт'];

/**
 *
 * @param providedCost provided cost per batch
 * @param quantity quantity (weight, number of pieces, rolls, etc)
 * @param multiplier number of products in one batch
 * @param convRule multiplier for converting g to kg, etc
 * @returns {{costRubles: number, costPenny: number}}
 */
function normalize(providedCost, quantity, multiplier, convRule) {
    let normalizedCost = Number(convRule * providedCost / (quantity * multiplier)).toFixed(2);

    let costRubles = Math.trunc(normalizedCost);
    let costPenny = Number(((normalizedCost - costRubles) * 100).toFixed(2))

    if (VPNA_DEBUG) {
        console.debug('Normalized cost', normalizedCost, '=>', costRubles, costPenny);
    }

    return {costRubles, costPenny};
}

/**
 * Iterates through added product cards, processes new ones
 */
function recalculate() {
    let catalogProducts = document.querySelectorAll('ul#catalogItems > li.xf-catalog__item > div.xf-product');

    catalogProducts.forEach(function (item) {
        if (item.getElementsByClassName('vprok-normalized-price')[0]) {
            /* Already processed, skip */
            return;
        }

        let costDiv = item.getElementsByClassName('xf-product-cost').item(0);

        if (!costDiv) {
            /* Out of stock or some other reason */
            return;
        }

        let {productName, providedCost, quantity, unit, multiplier, convRules} = parseProductCard(item, costDiv);

        if (VPNA_DEBUG) {
            console.debug(productName);
            console.debug(providedCost, quantity, unit, multiplier, convRules);
            console.debug(quantity, unit, '*', multiplier, 'with conversion rule', convRules);
        }
        let {costRubles, costPenny} = normalize(providedCost, quantity, multiplier, convRules[0]);

        renderNormalizedPrice(costRubles, costPenny, convRules[1], costDiv);
    })
}

/**
 * Observes main content pane for changes (page scroll adds elements to the list)
 * @type {MutationObserver}
 */
let observer = new MutationObserver(function (mutationsList) {
    recalculate();
});

/**
 * Assign an observer to site's content div.
 */
docReady(function () {
    observer.observe(elementToObserve, {characterData: false, childList: true, attributes: false});
    recalculate();
});

/**
 * Parse provided product card.
 *
 * Typical productTitle values:
 * - Коктейль из морепродуктов Placeholder в масле 415г
 * - Багет Placeholder замороженный 2шт*150г
 * - Молоко Placeholder пастеризованное 2.5% 1.4л
 * - Туалетная бумага Placeholder 4 рулона 3 слоя
 *
 * Possible multiplier variants:
 * - 250г, 150г*2шт, 2шт*150г, 1л, 2пак*150г, 8 рулонов, 5 пар
 *
 * @param productCard product card to parse
 * @param costDiv element containing pricing info
 * @returns {{unit: (number|string), multiplier: number, providedCost: string, quantity: number, productName: string, convRules: (number|string)[]}}
 */
function parseProductCard(productCard, costDiv) {
    let priceDivs = costDiv.getElementsByClassName('xf-price');
    let xfPriceDiv = priceDivs.item(priceDivs.length - 1);
    let productNameElement = productCard.getElementsByClassName('xf-product-title')
        .item(0).getElementsByTagName('a')
        .item(0);
    let productTitle = productNameElement.text.trim();
    let cost = xfPriceDiv.getAttribute('data-cost');
    // let quantumCost = xfPriceDiv.getAttribute('data-quantum-cost'); // TODO: used with dynamic switch, not implemented yet

    if (VPNA_DEBUG) {
        console.debug(productTitle);
    }

    const reResult = productTitle.match(quantityRegex);
    let mul1, mul2, quantity, unit;

    if (reResult) {
        mul1 = reResult.groups.mul1;
        mul2 = reResult.groups.mul2;
        quantity = reResult.groups.quantity;
        unit = reResult.groups.unit;
    } else {
        quantity = defaultConvRule[0];
        unit = defaultConvRule[1];
    }

    const multiplier = Math.max(1, mul1 || null, mul2 || null);
    const convRules = unificationTable.has(unit) ? unificationTable.get(unit) : defaultConvRule;
    quantity = Number.parseFloat(quantity);

    return {productName: productTitle, providedCost: cost, quantity, unit, multiplier, convRules};
}

/**
 * Format and insert given data into target div
 *
 * @param costRubles integer price component
 * @param costPenny fractional price component
 * @param unit normalized unit
 * @param targetDiv where to insert data
 */
function renderNormalizedPrice(costRubles, costPenny, unit, targetDiv) {
    let normalizedPriceDiv = document.createElement('div');
    normalizedPriceDiv.className = 'vprok-normalized-price';

    let rublesDiv = document.createElement('span');
    rublesDiv.className = 'vprok-normalized-price__rubles';
    rublesDiv.textContent = costRubles;
    normalizedPriceDiv.appendChild(rublesDiv);

    let pennyDiv = document.createElement('span');
    pennyDiv.className = 'vprok-normalized-price__penny';
    pennyDiv.textContent = costPenny > 0 ? ',' + costPenny + ' ' : ' ';
    normalizedPriceDiv.appendChild(pennyDiv);

    let unitDiv = document.createElement('span');
    unitDiv.className = 'vprok-normalized-price__unit';
    unitDiv.textContent = ' ₽/' + unit;
    normalizedPriceDiv.appendChild(unitDiv);

    targetDiv.appendChild(normalizedPriceDiv);
}

/**
 * Call some function onDocumentReady (https://stackoverflow.com/a/9899701/6948900)
 * @param fn function callback
 */
function docReady(fn) {
    // see if DOM is already available
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // call on next available tick
        setTimeout(fn, 1);
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}