type MetaToken = { role: 'meta'; key: string; value?: string; };
type Chunk = { chord: string; lyric: string; };
type Measure = Chunk[]
type MeasuresToken = { role: 'measures'; measures: Measure[]; };
type Token = MetaToken | MeasuresToken;

declare var scrapbox: any;

class AutoScroller {
	static #rafId: number | null = null;
	static #running = false;
	static #scroll = 0;
	static #lastScroll = 0;
	static speed = 1;

	static #setLastScroll() {
		AutoScroller.#lastScroll = scrollY;
	}
	static #scrollTo(pos: number) {
		window.scrollTo({ top: pos, behavior: 'instant' });
	}
	static #tick() {
		if (!AutoScroller.#running) return;

		// Apply auto scroll and user's scroll
		AutoScroller.#scroll += AutoScroller.speed + scrollY - AutoScroller.#lastScroll;

		const maxScroll = document.body.scrollHeight - window.innerHeight;
		if (AutoScroller.#scroll >= maxScroll) {
			AutoScroller.#scrollTo(maxScroll);
			AutoScroller.#running = false;
			return;
		} else if (AutoScroller.#scroll <= 0) {
			AutoScroller.#scrollTo(0);
			AutoScroller.#running = false;
			return;
		} else {
			AutoScroller.#scrollTo(AutoScroller.#scroll);
		}

		AutoScroller.#setLastScroll();
		AutoScroller.#rafId = requestAnimationFrame(() => AutoScroller.#tick());
	}

	static start() {
		if (AutoScroller.#running) return;
		AutoScroller.#running = true;
		AutoScroller.#setLastScroll();
		AutoScroller.#tick();
	}
	static stop() {
		AutoScroller.#running = false;
		if (AutoScroller.#rafId !== null) {
			cancelAnimationFrame(AutoScroller.#rafId);
			AutoScroller.#rafId = null;
		}
	}
}

class Chordpro {
	static readonly #metaRegExp = /^{(\w+)(?::(.+))?}$/;
	static readonly #measureRegExp = /^\|?(.*?)\|?$/;
	static readonly #chunkRegExp = /(?!$)(?:\[([^\]]*)\])?([^\[]*)/gm;
	static readonly #CSS_RULES = [
		'.mono { font-family: monospace; }',
		'.measures-container { display: flex; flex-wrap: balance; margin-top: 0.5em; margin-bottom: 0.5em; line-height: 1.2; font-size: 15px; }',
		'.measures-container > span { display: flex; flex-wrap: balance; }',
		'.measures-container > span > span { padding-right: 0.5em; }',
		'.sidemenu-container { position: absolute; right: 0px; }', 
		'form > * { padding: 5px; }'
	];
	static readonly #CONTENT_CONTAINER_ID = 'chordpro-content-container';
	static readonly #SIDEMENU_CONTAINER_ID = 'chordpro-sidemenu-container';

	static #sourceRoot: Element;
	static #chordproLines: string[];
	static #chordproTokens: Token[];

	static #readElement(): boolean {
		const codeElements = [...document.getElementsByClassName('code-block')];
		let sourceRoot: Element | null = null;
		const chordproElements: Element[] = [];
		let dopush = false;
		for (const e of codeElements) {
			if (!e.classList.contains('start') && dopush) {
				chordproElements.push(e);
			} else if (e.textContent === 'chordpro' && chordproElements.length === 0) {
				sourceRoot = e;
				dopush = true;
			} else {
				dopush = false;
			}
		}
		const chordproLines = chordproElements.map(e => e.textContent.trim());
		if (!sourceRoot) { return false; }
		Chordpro.#sourceRoot = sourceRoot;
		Chordpro.#chordproLines = chordproLines;
		return true;
	}
	static #parseMeasures(str: string): Measure[] {
		const measureMatch = str.match(Chordpro.#measureRegExp)!;
		const measureStringAry = measureMatch[1].split('|');
		const measures = measureStringAry.map(
			e => [...e.matchAll(Chordpro.#chunkRegExp)].map(
				e_ => {return {chord: e_[1], lyric: e_[2]}}
			)
		);
		return measures;
	}
	static #parseLines(): void {
		const tokens: Token[] = [];
		for (const e of Chordpro.#chordproLines) {
			const metaMatch = e.match(Chordpro.#metaRegExp);
			if (metaMatch !== null) {
				const role = 'meta';
				const key = metaMatch[1];
				const value = metaMatch[2];
				const token: MetaToken = value ? {role, key, value} : {role, key};
				tokens.push(token);
			} else {
				const role = 'measures';
				const measures = Chordpro.#parseMeasures(e);
				const token: MeasuresToken = {role, measures};
				tokens.push(token);
			}
		}
		Chordpro.#chordproTokens = tokens;
	}

	static #applyStyle() {
		const sheet = new CSSStyleSheet();
		for (const e of Chordpro.#CSS_RULES) {sheet.insertRule(e)};
		document.adoptedStyleSheets = [
			...document.adoptedStyleSheets,
			sheet
		];
	}

	static #appendMeta({key, value}: MetaToken, parent: Element) {
		switch (key) {
			default:
				const containerElement = document.createElement('div');
				const contentElement = document.createElement('span');
				contentElement.textContent = `{${key}:${value}}`;
				containerElement.appendChild(contentElement);
				parent.appendChild(containerElement);
				break;
		}
	}
	static #appendMeasures({measures}: MeasuresToken, parent: Element) {
		const containerElement = document.createElement('div');
		containerElement.classList.add('measures-container');
		for (const e of measures) {
			const measureStart: Chunk = {chord: '|', lyric: '|'};
			const measureEnd: Chunk = {chord: '|', lyric: '|'};

			const measureElement = document.createElement('span');
			for (const e_ of [measureStart, ...e, measureEnd]) {
				const chunkElement = document.createElement('span');
				const chordElement = document.createElement('div');
				const lyricElement = document.createElement('div');
				chordElement.textContent = `⁣${e_.chord ?? ''}`;
				lyricElement.textContent = `⁣${e_.lyric}`;
				chunkElement.appendChild(chordElement);
				chunkElement.appendChild(lyricElement);
				measureElement.appendChild(chunkElement);
			}
			containerElement.appendChild(measureElement);
		}
		parent.appendChild(containerElement);
	}
	static #appendContent() {
		const element = document.createElement('div');
		element.classList.add('mono');
		element.setAttribute('id', Chordpro.#CONTENT_CONTAINER_ID);

		for (const e of Chordpro.#chordproTokens) {
			switch (e.role) {
				case 'meta': Chordpro.#appendMeta(e, element); break;
				case 'measures': Chordpro.#appendMeasures(e, element); break;
			}
		}

		Chordpro.#sourceRoot.parentElement!.before(element);
	}

	static #appendScrollConfig(parent: Element) {
		const containerElement = document.createElement('form');
		const labelElement = document.createElement('label');
		const inputElement = document.createElement('input');
		const unitElement = document.createElement('span');
		const submitElement = document.createElement('button');

		containerElement.setAttribute('name', 'scroll_speed_form');
		labelElement.textContent = 'Scroll speed: ';
		labelElement.setAttribute('for', 'scroll_speed');
		inputElement.setAttribute('name', 'scroll_speed');
		inputElement.setAttribute('id', 'scroll_speed');
		inputElement.setAttribute('type', 'number');
		inputElement.setAttribute('value', '1.00');
		inputElement.setAttribute('step', '0.10');
		inputElement.setAttribute('placeholder', '1.00');
		unitElement.textContent = 'px/f';
		submitElement.textContent = 'Scroll';
		submitElement.setAttribute('type', 'submit');

		containerElement.appendChild(labelElement);
		containerElement.appendChild(inputElement);
		containerElement.appendChild(unitElement);
		containerElement.appendChild(submitElement);

		containerElement.addEventListener('submit', (event) => {
			event.preventDefault();
			const formdata = new FormData(containerElement);
			const scroll_speed = formdata.get('scroll_speed');
			if (typeof scroll_speed !== 'string') {throw new Error('Invalid input value')}
			AutoScroller.speed = parseFloat(scroll_speed);
			AutoScroller.start();
		});
		document.addEventListener('click', () => {
			AutoScroller.stop();
		});
		
		parent.appendChild(containerElement);
	}
	static #appendSidemenu() {
		const element = document.createElement('div');
		element.classList.add('sidemenu-container');
		element.setAttribute('id', Chordpro.#SIDEMENU_CONTAINER_ID);

		Chordpro.#appendScrollConfig(element);

		Chordpro.#sourceRoot.parentElement!.before(element);
	}

	static apply() {
		const oldElements = [
			document.getElementById(Chordpro.#CONTENT_CONTAINER_ID),
			document.getElementById(Chordpro.#SIDEMENU_CONTAINER_ID)
		];
		for (const e of oldElements) {if (e !== null) {e.remove()}}

		const hasChordpro = Chordpro.#readElement();
		if (!hasChordpro) return;
		Chordpro.#applyStyle();
		Chordpro.#parseLines();
		Chordpro.#appendSidemenu();
		Chordpro.#appendContent();
	}
}

scrapbox.on("page:changed", () => {
	Chordpro.apply();
});

window.addEventListener('load', () => {
	Chordpro.apply();
});

// Work in progress
type Diagram = {
	name: string;
	form?: 'C' | 'A' | 'G' | 'E' | 'D';
	fret: number;
	strings: [number, number, number, number, number, number]
};

class FpsExaminer {
	static #running = false;
	static #frames = 0;
	static #start = 0;
	static #last = 0;
	static #rafId: number | null = null;
	static #tick() {
		FpsExaminer.#frames++;
		FpsExaminer.#last = Date.now();
		requestAnimationFrame(() => FpsExaminer.#tick());
	}
	static start() {
		if (FpsExaminer.#running) return;
		FpsExaminer.#running = true;
		FpsExaminer.#frames = 0;
		FpsExaminer.#start = Date.now();
		FpsExaminer.#tick();
	}
	static stop() {
		FpsExaminer.#running = false;
		const rafId = FpsExaminer.#rafId;
		if (rafId) {
			cancelAnimationFrame(rafId);
			FpsExaminer.#rafId = null;
		}
		return FpsExaminer.#frames / (FpsExaminer.#last - FpsExaminer.#start) * 1000;
	}
}

class DiagramHandler {
	static readonly #DIAGRAM_INNERHTML = '<span>⁣　┌─┬─┬─┬─┐</span><br><span>⁣　│　│　│　│　│</span><br><span>⁣　├─┼─┼─┼─┤</span><br><span>⁣　│　│　│　│　│</span><br><span>⁣　├─┼─┼─┼─┤</span><br><span>⁣　│　│　│　│　│</span><br><span>⁣　├─┼─┼─┼─┤</span><br><span>⁣　│　│　│　│　│</span><br><span>⁣　├─┼─┼─┼─┤</span><br><span>⁣　│　│　│　│　│</span><br><span>⁣　└─┴─┴─┴─┘</span>';
	static readonly #OPEN_SYMBOL_PATH = 'M14 4V0H12v4H4v8H0v2h4v8h8v4h2V22h8V14h4V12H22V4H14v2h6V20H6V6h8Z';
	static readonly #CSS_RULES = [
		'.mono { font-family: monospace; }',
		'.diagram-container { display: flex; }',
		'.diagram { line-height: 0.7; }',
		'.diagram-label { text-align: center; }',
		'.diagram-frame { position: absolute; }',
		'.open-symbol { position: absolute; }',
		'.open-symbol-path { transform: scale(0.5); }'
	];

	static #createDiagramElement(diagram: Diagram, withClass: boolean = true) {
		const containerElement = document.createElement('div');
		if (withClass) {containerElement.classList.add('mono', 'diagram')}

		const labelElement = document.createElement('div');
		const spacerElement = document.createElement('div');
		const diagramFrameElement = document.createElement('div');
		const diagramContentElement = document.createElement('div');
		labelElement.classList.add('diagram-label');
		labelElement.textContent = diagram.name;
		spacerElement.textContent = '⁣　　　　　　　　　　⁣';
		diagramFrameElement.classList.add('dialog-frame');
		diagramFrameElement.innerHTML = DiagramHandler.#DIAGRAM_INNERHTML;
		for (let i = 0; i < diagram.strings.length; i++) {
			const e = diagram.strings[i];
			let contentElement = document.createElement('span');
			if (e === -1) {
				contentElement.textContent = '⁣'
			} else if (e === 0) {
				const svgElement = document.createElement('svg');
				const pathElement = document.createElement('path');
				svgElement.classList.add('open-symbol');
				pathElement.classList.add('open-symbol-path');
				pathElement.setAttribute('d', DiagramHandler.#OPEN_SYMBOL_PATH);
				svgElement.appendChild(pathElement);
				contentElement.appendChild(svgElement);
			} else {
				contentElement.textContent = `⁣${'　'.repeat(e*2)}●`;
			}
			diagramContentElement.appendChild(contentElement);
			if (i < diagram.strings.length - 1) {
				for (let i = 0; i < 2; i++) {diagramContentElement.appendChild(document.createElement('br'))};
			}
		}

		containerElement.appendChild(labelElement);
		containerElement.appendChild(spacerElement);
		containerElement.appendChild(diagramFrameElement);
		containerElement.appendChild(diagramContentElement);
		return containerElement;
	}
	static #applyDiagramElements(diagrams: Diagram[], parent: Element) {
		const diagramContainerElement = document.createElement('div');
		diagramContainerElement.classList.add('mono', 'diagram', 'diagram-container');
		for (const e of diagrams) {
			diagramContainerElement.appendChild(DiagramHandler.#createDiagramElement(e, false));
		}
		const fc = parent.firstChild;
		fc ? fc.before(diagramContainerElement) : parent.appendChild(diagramContainerElement);
	}
}
