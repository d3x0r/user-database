/**
 * @fileoverview SashPicker — popup for choosing a login role ("sash") at
 * connection time. Lifted out of @d3x0r/popups since it's specific to this
 * login service.
 *
 * Expects the consumer to provide a `pickSashForm.html` and `pickSashForm.js`
 * (or override via opts.useSashForm / opts.sashScript). The sash script must
 * export setForm(formRef), addChoice(choice), and getChoice().
 */

import { Popup } from "/node_modules/@d3x0r/popups2/popups.js";
import { fillFromURL } from "/node_modules/@d3x0r/popups2/core/fill-from-url.js";

/**
 * @typedef {object} SashPickerOptions
 * @property {string} [useSashForm]  HTML file for the picker; defaults to "pickSashForm.html".
 * @property {string} [sashScript]   Companion module; defaults to "pickSashForm.js".
 */

export class SashPicker extends Popup {
	choices = [];
	sashModule = null;
	/** @type {{p:Promise<any>, res:(v:any)=>void, rej:(e:any)=>void}|null} */
	promise = null;

	/** @param {SashPickerOptions} [opts] */
	constructor( opts ) {
		super( "Please select login role", null, { enableClose: false } );
		const form = opts?.useSashForm || "pickSashForm.html";

		import( opts?.sashScript || "pickSashForm.js" ).then( ( sashModule ) => {
			this.sashModule = sashModule;
			// NOTE: original referenced undefined `pickSashForm`; behavior preserved.
			sashModule.setForm( this );
		} ).catch( () => {
			console.log( "Sash form resulted with an error?" );
		} );

		this.hide();

		fillFromURL( this, form ).then( () => {
			this.center();
			this.on( "load", this );
		} ).catch( () => {
			if( this.promise ) this.promise.rej( "Choice selection form failed to load." );
		} );

		this.on( "ok", () => {
			const choice = this.sashModule ? this.sashModule.getChoice() : null;
			if( this.promise ) this.promise.res( choice || this.choices[0] );
			this.hide();
		} );
		this.on( "cancel", () => {
			if( this.promise ) this.promise.rej( "Choice canceled by user." );
			this.hide();
		} );
	}

	/** @param {any[]} choices */
	/** @param {any[]} choices @param {{p:Promise<any>,res:Function,rej:Function}} [promise] */
	show( choices, promise ) {
		if( promise ) this.promise = promise;
		this.on( "reset" );
		this.choices = choices;
		if( this.sashModule )
			for( const choice of choices ) this.sashModule.addChoice( choice );
		super.show();
		this.center();
	}
}
