/**
 * @fileoverview Login form factory. Loads an HTML form into a Popup, wires
 * the websocket login client, and exposes Alert + sash-picker prompts.
 *
 * Moved here from @d3x0r/popups together with SashPicker since both are
 * specific to the login service.
 */

import { createPopup, Popup } from "/node_modules/@d3x0r/popups2/popups.js";
import { fillFromURL } from "/node_modules/@d3x0r/popups2/core/fill-from-url.js";
import { Alert } from "/node_modules/@d3x0r/popups2/forms/alert.js";
import { SashPicker } from "./sash-picker.js";

/**
 * @typedef {object} LoginFormOptions
 * @property {HTMLElement|Popup} [parent]
 * @property {string}            [useForm]      HTML file for the login form (default "loginForm.html").
 * @property {string}            [useSashForm]  Forwarded to SashPicker.
 * @property {string}            [sashScript]   Forwarded to SashPicker.
 * @property {any}                [wsLoginClient]  Optional websocket client; if present, controls are bound on load.
 * @property {(root:ShadowRoot)=>void} [ready]    Called once the form HTML and scripts are loaded.
 */

/**
 * @param {(arg:any) => void} doLogin  Invoked from the form's login action.
 * @param {LoginFormOptions} [opts]
 * @returns {Popup & { connect:()=>void, disconnect:()=>void, login:(a:any)=>void, pickSash:(choices:any[])=>Promise<any>, Alert: typeof Alert, setClient:(c:any)=>void }}
 */
export function makeLoginForm( doLogin, opts ) {
	const loginForm = createPopup( "Connecting", opts?.parent, { enableClose: false } );
	let pickSashForm = null;

	const form = opts?.useForm || "loginForm.html";
	let wsClient = opts?.wsLoginClient;

	loginForm.connect = function() {
		loginForm.caption = "Login Ready...";
	};
	loginForm.disconnect = function() {
		loginForm.caption = "Connecting...";
		loginForm.show();
	};
	loginForm.login = function( a ) {
		if( doLogin ) doLogin( a );
	};
	loginForm.pickSash = function( choices ) {
		const p = { p: null, res: null, rej: null };
		p.p = new Promise( ( res, rej ) => { p.res = res; p.rej = rej; } );
		if( !pickSashForm ) {
			pickSashForm = new SashPicker( opts );
			pickSashForm.on( "load", () => { fillChoices(); } );
		} else {
			fillChoices();
		}
		function fillChoices() { pickSashForm.show( choices, p ); }
		return p.p;
	};
	loginForm.Alert = Alert;
	loginForm.setClient = function( wsClient_ ) { wsClient = wsClient_; };
	loginForm.hide();

	fillFromURL( loginForm, form, opts ).then( async ( root ) => {
		if( wsClient ) wsClient.bindControls( loginForm, root );
		loginForm.center();
		if( opts.ready ) opts.ready( root );
	} );

	if( !wsClient ) loginForm.show();
	return loginForm;
}
