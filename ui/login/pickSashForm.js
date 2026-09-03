// Companion module for the sash picker (sash-picker.js): builds the choice list inside
// the picker's form and reports the selection.  Choices arrive from the login server as
// { name, master, badges:[tags] }.
let form = null;          // the SashPicker popup
let lastChoice = null;
let entries = [];         // { el, choice }
let wired = false;

function root() {
	// fillFromURL attaches the form as a shadow root on the popup; it is not in document
	return form && ( form.divContent_ || form.shadowRoot || null );
}

function wireButtons() {
	const r = root();
	if( wired || !r ) return;
	const ok = r.querySelector( "#Ok" );
	const cancel = r.querySelector( "#Cancel" );
	if( !ok || !cancel ) return;
	ok.addEventListener( "click", ()=>form.on( "ok", true ) );
	cancel.addEventListener( "click", ()=>{ lastChoice = null; form.on( "cancel", true ); } );
	wired = true;
}

export function setForm( f ) {
	form = f;
	form.on( "reset", ()=>{
		for( const e of entries ) e.el.remove();
		entries = [];
		lastChoice = null;
	} );
	form.on( "load", ()=>wireButtons() );
}

export function addChoice( choice ) {
	const r = root();
	wireButtons();
	const list = r && r.querySelector( "#choiceList" );
	if( !list ) { console.log( "sash picker form has no #choiceList yet" ); return; }
	const li = document.createElement( "li" );
	li.className = "sash-choice";
	const label = document.createElement( "label" );
	const radio = document.createElement( "input" );
	radio.type = "radio";
	radio.name = "sashChoice";
	radio.value = choice.name;
	label.appendChild( radio );
	const text = document.createElement( "span" );
	text.textContent = " " + choice.name + ( choice.master ? " (master)" : "" );
	label.appendChild( text );
	if( choice.badges && choice.badges.length ) {
		const b = document.createElement( "div" );
		b.className = "sash-choice-badges";
		b.textContent = choice.badges.join( ", " );
		label.appendChild( b );
	}
	li.appendChild( label );
	list.appendChild( li );
	radio.addEventListener( "change", ()=>{ if( radio.checked ) lastChoice = choice; } );
	// first (or master) choice starts selected so Ok always means something
	if( !lastChoice || ( choice.master && !lastChoice.master ) ) { radio.checked = true; lastChoice = choice; }
	entries.push( { el:li, choice } );
}

export function getChoice() {
	return lastChoice;
}
