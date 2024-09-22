//"use strict";
// jsox.js
// JSOX JavaScript Object eXchange. Inherits human features of comments
// and extended formatting from JSON6; adds macros, big number and date
// support.  See README.md for details.
//
// This file is based off of https://github.com/JSON6/  ./lib/json6.js
// which is based off of https://github.com/d3x0r/sack  ./src/netlib/html5.websocket/json6_parser.c
//

//const util = require('util'); // debug inspect.
//import util from 'util'; 

const _JSON=JSON; // in case someone does something like JSON=JSOX; we still need a primitive _JSON for internal stringification
const JSOX = {};
//const JSOX = exports;
//exports.JSOX = JSOX;

JSOX.version = "1.2.120";

//function privateizeEverything() {
//const _DEBUG_LL = false;
//const _DEBUG_PARSING = false;
//const _DEBUG_STRINGIFY = false;
//const _DEBUG_PARSING_STACK = false;
//const _DEBUG_PARSING_NUMBERS = false;
//const _DEBUG_PARSING_DETAILS = false;
//const _DEBUG_PARSING_CONTEXT = false;
//const _DEBUG_REFERENCES = false; // this tracks folling context stack when the components have not been completed.
//const _DEBUG_WHITESPACE = false; 
const hasBigInt = (typeof BigInt === "function");
const VALUE_UNDEFINED = -1;
const VALUE_UNSET = 0;
const VALUE_NULL = 1;
const VALUE_TRUE = 2;
const VALUE_FALSE = 3;
const VALUE_STRING = 4;
const VALUE_NUMBER = 5;
const VALUE_OBJECT = 6;
const VALUE_NEG_NAN = 7;
const VALUE_NAN = 8;
const VALUE_NEG_INFINITY = 9;
const VALUE_INFINITY = 10;
//const VALUE_DATE = 11  // unused yet; this is actuall a subType of VALUE_NUMBER
const VALUE_EMPTY = 12; // [,] makes an array with 'empty item'
const VALUE_ARRAY = 13; //
// internally arrayType = -1 is a normal array
// arrayType = -2 is a reference array, which, which closed is resolved to
//     the specified object.
// arrayType = -3 is a normal array, that has already had this element pushed.
const knownArrayTypeNames = ["ab","u8","cu8","s8","u16","s16","u32","s32","u64","s64","f32","f64"];
let arrayToJSOX = null;
let mapToJSOX = null;
const knownArrayTypes = [ArrayBuffer
                        ,Uint8Array,Uint8ClampedArray,Int8Array
                        ,Uint16Array,Int16Array
                        ,Uint32Array,Int32Array
                        ,null,null//,Uint64Array,Int64Array
                        ,Float32Array,Float64Array];
// somehow max isn't used... it would be the NEXT available VALUE_XXX value...
//const VALUE_ARRAY_MAX = VALUE_ARRAY + knownArrayTypes.length + 1; // 1 type is not typed; just an array.

const WORD_POS_RESET = 0;
const WORD_POS_TRUE_1 = 1;
const WORD_POS_TRUE_2 = 2;
const WORD_POS_TRUE_3 = 3;
const WORD_POS_FALSE_1 = 5;
const WORD_POS_FALSE_2 = 6;
const WORD_POS_FALSE_3 = 7;
const WORD_POS_FALSE_4 = 8;
const WORD_POS_NULL_1 = 9;
const WORD_POS_NULL_2 = 10;
const WORD_POS_NULL_3 = 11;
const WORD_POS_UNDEFINED_1 = 12;
const WORD_POS_UNDEFINED_2 = 13;
const WORD_POS_UNDEFINED_3 = 14;
const WORD_POS_UNDEFINED_4 = 15;
const WORD_POS_UNDEFINED_5 = 16;
const WORD_POS_UNDEFINED_6 = 17;
const WORD_POS_UNDEFINED_7 = 18;
const WORD_POS_UNDEFINED_8 = 19;
const WORD_POS_NAN_1 = 20;
const WORD_POS_NAN_2 = 21;
const WORD_POS_INFINITY_1 = 22;
const WORD_POS_INFINITY_2 = 23;
const WORD_POS_INFINITY_3 = 24;
const WORD_POS_INFINITY_4 = 25;
const WORD_POS_INFINITY_5 = 26;
const WORD_POS_INFINITY_6 = 27;
const WORD_POS_INFINITY_7 = 28;

const WORD_POS_FIELD = 29;
const WORD_POS_AFTER_FIELD = 30;
const WORD_POS_END = 31;
const WORD_POS_AFTER_FIELD_VALUE = 32;
//const WORD_POS_BINARY = 32;

const CONTEXT_UNKNOWN = 0;
const CONTEXT_IN_ARRAY = 1;
const CONTEXT_OBJECT_FIELD = 2;
const CONTEXT_OBJECT_FIELD_VALUE = 3;
const CONTEXT_CLASS_FIELD = 4;
const CONTEXT_CLASS_VALUE = 5;
const CONTEXT_CLASS_FIELD_VALUE = 6;
const keywords = {	["true"]:true,["false"]:false,["null"]:null,["NaN"]:NaN,["Infinity"]:Infinity,["undefined"]:undefined };

/*
Extend Date type with a nanosecond field.
*/
class DateNS extends Date {
	constructor(a,b ) {
		super(a);
		this.ns = b||0;
	}	
}

JSOX.DateNS = DateNS;

const contexts = [];
function getContext() {
	let ctx = contexts.pop();
	if( !ctx )
		ctx = { context : CONTEXT_UNKNOWN
		      , current_proto : null
		      , current_class : null
		      , current_class_field : 0
		      , arrayType : -1
		      , valueType : VALUE_UNSET
		      , elements : null
		      };
	return ctx;
}
function dropContext(ctx) { 
	contexts.push( ctx ); 
}

const buffers = [];
function getBuffer() { let buf = buffers.pop(); if( !buf ) buf = { buf:null, n:0 }; else buf.n = 0; return buf; }
function dropBuffer(buf) { buffers.push( buf ); }

/**
 * @param {string} string 
 * @returns {string}
 */
JSOX.escape = function(string) {
	let n;
	let output = '';
	if( !string ) return string;
	for( n = 0; n < string.length; n++ ) {
		if( ( string[n] == '"' ) || ( string[n] == '\\' ) || ( string[n] == '`' )|| ( string[n] == '\'' )) {
			output += '\\';
		}
		output += string[n];
	}
	return output;
};


let toProtoTypes = new WeakMap();
let toObjectTypes = new Map();
let fromProtoTypes = new Map();
let commonClasses = [];

JSOX.reset = resetJSOX;

function resetJSOX() {
	toProtoTypes = new WeakMap();
	toObjectTypes = new Map();
	fromProtoTypes = new Map();
	commonClasses = [];	
}

/**
 * @param {(value:any)} [cb]
 * @param {(this: unknown, key: string, value: unknown) => any} [reviver] 
 * @returns {none}
*/
JSOX.begin = function( cb, reviver ) {

	const val = { name : null,	  // name of this value (if it's contained in an object)
			value_type: VALUE_UNSET, // value from above indiciating the type of this value
			string : '',   // the string value of this value (strings and number types only)
			contains : null,
			className : null,
		};
	
	const pos = { line:1, col:1 };
	let	n = 0;
	let     str;
	let	localFromProtoTypes = new Map();
	let	word = WORD_POS_RESET,
		status = true,
		redefineClass = false,
		negative = false,
		result = null,
		rootObject = null,
		elements = undefined,
		context_stack = {
			first : null,
			last : null,
			saved : null,
			push(node) {
				//_DEBUG_PARSING_CONTEXT && console.log( "pushing context:", node );
				let recover = this.saved;
				if( recover ) { this.saved = recover.next; 
					recover.node = node; 
					recover.next = null; 
					recover.prior = this.last; }
				else { recover = { node : node, next : null, prior : this.last }; }
				if( !this.last ) this.first = recover;
				else this.last.next = recover;
				this.last = recover;
				this.length++;
			},
			pop() {
				let result = this.last;
				// through normal usage this line can never be used.
				//if( !result ) return null;
				if( !(this.last = result.prior ) ) this.first = null;
				result.next = this.saved;
				if( this.last ) this.last.next = null;
				if( !result.next ) result.first = null;
				this.saved = result;
				this.length--;
				//_DEBUG_PARSING_CONTEXT && console.log( "popping context:", result.node );
				return result.node;
			},
			length : 0,
			/*dump() {  // //_DEBUG_CONTEXT_STACK
				console.log( "STACK LENGTH:", this.length );
				let cur= this.first;
				let level = 0;
				while( cur ) {
					console.log( "Context:", level, cur.node );
					level++;
					cur = cur.next;
				}
			}*/
		},
		classes = [],  // class templates that have been defined.
		protoTypes = {},
		current_proto = null,  // the current class being defined or being referenced.
		current_class = null,  // the current class being defined or being referenced.
		current_class_field = 0,
		arrayType = -1,  // the current class being defined or being referenced.
		parse_context = CONTEXT_UNKNOWN,
		comment = 0,
		fromHex = false,
		decimal = false,
		exponent = false,
		exponent_sign = false,
		exponent_digit = false,
		inQueue = {
			first : null,
			last : null,
			saved : null,
			push(node) {
				let recover = this.saved;
				if( recover ) { this.saved = recover.next; recover.node = node; recover.next = null; recover.prior = this.last; }
				else { recover = { node : node, next : null, prior : this.last }; }
				if( !this.last ) this.first = recover;
				else this.last.next = recover;
				this.last = recover;
			},
			shift() {
				let result = this.first;
				if( !result ) return null;
				if( !(this.first = result.next ) ) this.last = null;
				result.next = this.saved; this.saved = result;
				return result.node;
			},
			unshift(node) {
				let recover = this.saved;
				// this is always true in this usage.
				//if( recover ) { 
					this.saved = recover.next; recover.node = node; recover.next = this.first; recover.prior = null; 
				//}
				//else { recover = { node : node, next : this.first, prior : null }; }
				if( !this.first ) this.last = recover;
				this.first = recover;
			}
		},
		gatheringStringFirstChar = null,
		gatheringString = false,
		gatheringNumber = false,
		stringEscape = false,
		cr_escaped = false,
		unicodeWide = false,
		stringUnicode = false,
		stringHex = false,
		hex_char = 0,
		hex_char_len = 0,
		completed = false,
		date_format = false,
		isBigInt = false
		;

	function throwEndError( leader ) {
		throw new Error( `${leader} at ${n} [${pos.line}:${pos.col}]`);
	}

	return {
		/**
		 * Define a class that can be used to deserialize objects of this type.
		 * @param {string} prototypeName 
		 * @param {type} o 
		 * @param {(any)=>any} f 
		 */
		fromJSOX( prototypeName, o, f ) {
			if( localFromProtoTypes.get(prototypeName) ) throw new Error( "Existing fromJSOX has been registered for prototype" );
			function privateProto() { }
			if( !o ) o = privateProto;
			if( o && !("constructor" in o )){
				throw new Error( "Please pass a prototype like thing...");
			}
			localFromProtoTypes.set( prototypeName, { protoCon:o.prototype.constructor, cb:f } );
		},
		registerFromJSOX( prototypeName, o/*, f*/ ) {
			throw new Error( "registerFromJSOX is deprecated, please update to use fromJSOX instead:" + prototypeName + o.toString() );
		},
		finalError() {
			if( comment !== 0 ) { // most of the time everything's good.
				if( comment === 1 ) throwEndError( "Comment began at end of document" );
				if( comment === 3 ) throwEndError( "Open comment '/*' is missing close at end of document" );
				if( comment === 4 ) throwEndError( "Incomplete '/* *' close at end of document" );
			}
			if( gatheringString ) throwEndError( "Incomplete string" );
		},
		value() {
			this.finalError();
			let r = result;
			result = undefined;
			return r;
		},
		/**
		 * Reset the parser to a blank state.
		 */
		reset() {
			word = WORD_POS_RESET;
			status = true;
			if( inQueue.last ) inQueue.last.next = inQueue.save;
			inQueue.save = inQueue.first;
			inQueue.first = inQueue.last = null;
			if( context_stack.last ) context_stack.last.next = context_stack.save;
			context_stack.length = 0;
			context_stack.save = inQueue.first;
			context_stack.first = context_stack.last = null;//= [];
			elements = undefined;
			parse_context = CONTEXT_UNKNOWN;
			classes = [];
			protoTypes = {};
			current_proto = null;
			current_class = null;
			current_class_field = 0;
			val.value_type = VALUE_UNSET;
			val.name = null;
			val.string = '';
			val.className = null;
			pos.line = 1;
			pos.col = 1;
			negative = false;
			comment = 0;
			completed = false;
			gatheringString = false;
			stringEscape = false;  // string stringEscape intro
			cr_escaped = false;   // carraige return escaped
			date_format = false;
			//stringUnicode = false;  // reading \u
			//unicodeWide = false;  // reading \u{} in string
			//stringHex = false;  // reading \x in string
		},
		usePrototype(className,protoType ) { protoTypes[className] = protoType; },
		/**
		 * Add input to the parser to get parsed.
		 * @param {string} msg 
		 */
		write(msg) {
			let retcode;
			if (typeof msg !== "string" && typeof msg !== "undefined") msg = String(msg);
			if( !status ) throw new Error( "Parser is still in an error state, please reset before resuming" );
			for( retcode = this._write(msg,false); retcode > 0; retcode = this._write() ) {
				if( typeof reviver === 'function' ) (function walk(holder, key) {
					let k, v, value = holder[key];
					if (value && typeof value === 'object') {
						for (k in value) {
							if (Object.prototype.hasOwnProperty.call(value, k)) {
								v = walk(value, k);
								if (v !== undefined) {
									value[k] = v;
								} else {
									delete value[k];
								}
							}
						}
					}
					return reviver.call(holder, key, value);
				}({'': result}, ''));
				result = cb( result );

				if( retcode < 2 )
					break;
			}
		},
		/**
		 * Parse a string and return the result.
		 * @param {string} msg
		 * @param {(key:string,value:any)=>any} [reviver]
		 * @returns {any}
		 */
		parse(msg,reviver) {
			if (typeof msg !== "string") msg = String(msg);
			this.reset();
			const writeResult = this._write( msg, true );
			if( writeResult > 0 ) {
				let result = this.value();
				if( ( "undefined" === typeof result ) && writeResult > 1 ){
					throw new Error( "Pending value could not complete");
				}
	                
				result = typeof reviver === 'function' ? (function walk(holder, key) {
					let k, v, value = holder[key];
					if (value && typeof value === 'object') {
						for (k in value) {
							if (Object.prototype.hasOwnProperty.call(value, k)) {
								v = walk(value, k);
								if (v !== undefined) {
									value[k] = v;
								} else {
									delete value[k];
								}
							}
						}
					}
					return reviver.call(holder, key, value);
				}({'': result}, '')) : result;
				return result;
			}
			this.finalError();
			return undefined;
		},
		_write(msg,complete_at_end) {
			let cInt;
			let input;
			let buf;
			let retval = 0;
			function throwError( leader, c ) {
				throw new Error( `${leader} '${String.fromCodePoint( c )}' unexpected at ${n} (near '${buf.substr(n>4?(n-4):0,n>4?3:(n-1))}[${String.fromCodePoint( c )}]${buf.substr(n, 10)}') [${pos.line}:${pos.col}]`);
			}

			function RESET_VAL()  {
				val.value_type = VALUE_UNSET;
				val.string = '';
				val.contains = null;
				//val.className = null;
			}

			function convertValue() {
				let fp = null;
				//_DEBUG_PARSING && console.log( "CONVERT VAL:", val );
				switch( val.value_type ){
				case VALUE_NUMBER:
					//1502678337047
					if( ( ( val.string.length > 13 ) || ( val.string.length == 13 && val[0]>'2' ) )
					    && !date_format && !exponent_digit && !exponent_sign && !decimal ) {
						isBigInt = true;
					}
					if( isBigInt ) { if( hasBigInt ) return BigInt(val.string); else throw new Error( "no builtin BigInt()", 0 ) }
					if( date_format ) { 
						const r = val.string.match(/\.(\d\d\d\d*)/ );
						const frac = ( r )?( r )[1]:null;
						if( !frac || (frac.length < 4) ) {
							const r = new Date( val.string ); 
							if(isNaN(r.getTime())) throwError( "Bad Date format", cInt ); return r;  
						} else {
							let ns = frac.substr( 3 );
							while( ns.length < 6 ) ns = ns+'0';
							const r = new DateNS( val.string, Number(ns ) ); 
							if(isNaN(r.getTime())) throwError( "Bad DateNS format" + r+r.getTime(), cInt ); return r;  
						}
						//const r = new Date( val.string ); if(isNaN(r.getTime())) throwError( "Bad number format", cInt ); return r;  
					}
					return  (negative?-1:1) * Number( val.string );
				case VALUE_STRING:
					if( val.className ) {
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						if( fp && fp.cb ) {
							val.className = null;
							return fp.cb.call( val.string );
						} else {
							// '[object Object]' throws this error.
							throw new Error( "Double string error, no constructor for: new " + val.className + "("+val.string+")" )
						}	
					}
					return val.string;
				case VALUE_TRUE:
					return true;
				case VALUE_FALSE:
					return false;
				case VALUE_NEG_NAN:
					return -NaN;
				case VALUE_NAN:
					return NaN;
				case VALUE_NEG_INFINITY:
					return -Infinity;
				case VALUE_INFINITY:
					return Infinity;
				case VALUE_NULL:
					return null;
				case VALUE_UNDEFINED:
					return undefined;
				case VALUE_EMPTY:
					return undefined;
				case VALUE_OBJECT:
					if( val.className ) { 
						//_DEBUG_PARSING_DETAILS && console.log( "class reviver" );
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						val.className = null;
						if( fp && fp.cb ) return val.contains = fp.cb.call( val.contains ); 
					}
					return val.contains;
				case VALUE_ARRAY:
					//_DEBUG_PARSING_DETAILS && console.log( "Array conversion:", arrayType, val.contains );
					if( arrayType >= 0 ) {
						let ab;
						if( val.contains.length )
							ab = DecodeBase64( val.contains[0] );
						else ab = DecodeBase64( val.string );
						if( arrayType === 0 ) {
							arrayType = -1;
							return ab;
						} else {
							const newab = new knownArrayTypes[arrayType]( ab );
							arrayType = -1;
							return newab;
						}
					} else if( arrayType === -2 ) {
						let obj = rootObject;
						//let ctx = context_stack.first;
						let lvl;
						//console.log( "Resolving Reference...", context_stack.length );
						//console.log( "--elements and array", elements );
						
						const pathlen = val.contains.length;
						for( lvl = 0; lvl < pathlen; lvl++ ) {
							const idx = val.contains[lvl];
							//_DEBUG_REFERENCES && console.log( "Looking up idx:", idx, "of", val.contains, "in", obj );
							let nextObj = obj[idx];

							//_DEBUG_REFERENCES  && console.log( "Resolve path:", lvl, idx,"in", obj, context_stack.length, val.contains.toString() );
							//_DEBUG_REFERENCES && console.log( "NEXT OBJECT:", nextObj );
							if( !nextObj ) {
								{
									let ctx = context_stack.first;
									let p = 0;
									//_DEBUG_PARSING_CONTEXT && context_stack.dump();
									while( ctx && p < pathlen && p < context_stack.length ) {
										const thisKey = val.contains[p];
										if( !ctx.next || thisKey !== ctx.next.node.name ) {
											break;  // can't follow context stack any further.... 
										}
										//_DEBUG_REFERENCES && console.log( "Checking context:", obj, "p=",p, "key=",thisKey, "ctx(and .next)=",util.inspect(ctx));
										//console.dir(ctx, { depth: null })
										if( ctx.next ) {
											if( "number" === typeof thisKey ) {
												const actualObject = ctx.next.node.elements;
												//_DEBUG_REFERENCES && console.log( "Number in index... tracing stack...", obj, actualObject, ctx && ctx.next && ctx.next.next && ctx.next.next.node );

												if( actualObject && thisKey >= actualObject.length ) {
													//_DEBUG_REFERENCES && console.log( "AT ", p, actualObject.length, val.contains.length );
													if( p === (context_stack.length-1) ) {
														//_DEBUG_REFERENCES && 
																console.log( "This is actually at the current object so use that", p, val.contains, elements );
														nextObj = elements;
														p++;
														
														ctx = ctx.next;
														break;
													}
													else {
															//_DEBUG_REFERENCES && console.log( "is next... ", thisKey, actualObject.length )
														if( ctx.next.next && thisKey === actualObject.length ) {
															//_DEBUG_REFERENCES && console.log( "is next... ")
															nextObj = ctx.next.next.node.elements;
															ctx = ctx.next;
															p++;
															obj = nextObj;
															continue;
														}
														//_DEBUG_REFERENCES && console.log( "FAILING HERE", ctx.next, ctx.next.next, elements, obj );
														//_DEBUG_REFERENCES && console.log( "Nothing after, so this is just THIS?" );
														nextObj = elements;
														p++; // make sure to exit.

														break;
														//obj = next
													}
												}
											} else {
												//_DEBUG_REFERENCES && console.log( "field AT index", p,"of", val.contains.length );
												if( thisKey !== ctx.next.node.name ){
													//_DEBUG_REFERENCES && console.log( "Expect:", thisKey, ctx.next.node.name, ctx.next.node.elements );
													nextObj = ( ctx.next.node.elements[thisKey] );
													//throw new Error( "Unexpected path-context relationship" );													
													lvl = p;
													break;
												} else {
													//_DEBUG_REFERENCES && console.log( "Updating next object(NEW) to", ctx.next.node, elements, thisKey)
													if( ctx.next.next )
														nextObj = ctx.next.next.node.elements;
													else {
														//_DEBUG_REFERENCES && console.log( "Nothing after, so this is just THIS?" );
														nextObj = elements;
													}
													//_DEBUG_REFERENCES && console.log( "using named element from", ctx.next.node.elements, "=", nextObj )
												}
											}
											//if( //_DEBUG_REFERENCES )  {
											//	const a = ctx.next.node.elements;
											//	console.log( "Stack Dump:"
											//		, a?a.length:a
											//		, ctx.next.node.name
											//		, thisKey
											//		);
											//}
										} else {
											nextObj = nextObj[thisKey];
										}
										//_DEBUG_REFERENCES && console.log( "Doing next context??", p, context_stack.length, val.contains.length );
										ctx = ctx.next;
										p++;
									}
									//_DEBUG_REFERENCES && console.log( "Done with context stack...level", lvl, "p", p );
									if( p < pathlen )
										lvl = p-1;
									else lvl = p;
								}
								//_DEBUG_REFERENCES && console.log( "End of processing level:", lvl );
							}
							if( ("object" === typeof nextObj ) && !nextObj ) {
								throw new Error( "Path did not resolve properly:" +  val.contains + " at " + idx + '(' + lvl + ')' );
							}
							obj = nextObj;
						}
						//_DEBUG_PARSING && console.log( "Resulting resolved object:", obj );
						//_DEBUG_PARSING_DETAILS && console.log( "SETTING MODE TO -3 (resolved -2)" );
						arrayType = -3;
						return obj;
					}
					if( val.className ) { 
						fp = localFromProtoTypes.get( val.className );
						if( !fp )
							fp = fromProtoTypes.get( val.className );
						val.className = null; 
						if( fp && fp.cb ) return fp.cb.call( val.contains ); 
					}
					return val.contains;
				default:
					console.log( "Unhandled value conversion.", val );
					break;
				}
			}

			function arrayPush() {
				//_DEBUG_PARSING && console.log( "PUSH TO ARRAY:", val );
				if( arrayType == -3 )  {
					//_DEBUG_PARSING && console.log(" Array type -3?", val.value_type, elements );
					if( val.value_type === VALUE_OBJECT ) {
						elements.push( val.contains );
					}
					arrayType = -1; // next one should be allowed?
					return;
				} //else
				//	console.log( "Finally a push that's not already pushed!", );
				switch( val.value_type ){
				case VALUE_EMPTY:
					elements.push( undefined );
					delete elements[elements.length-1];
					break;
				default:
					elements.push( convertValue() );
					break;
				}
				RESET_VAL();
			}

			function objectPush() {
				if( arrayType === -3 && val.value_type === VALUE_ARRAY ) {
					//console.log( "Array has already been set in object." );
					//elements[val.name] = val.contains;
					RESET_VAL();
					arrayType = -1;
					return;
				}
				if( val.value_type === VALUE_EMPTY ) return;
				if( !val.name && current_class ) {
					//_DEBUG_PARSING_DETAILS && console.log( "A Stepping current class field:", current_class_field, val.name );
					val.name = current_class.fields[current_class_field++];
				}
				let value = convertValue();

				if( current_proto && current_proto.protoDef && current_proto.protoDef.cb ) {
					//_DEBUG_PARSING_DETAILS && console.log( "SOMETHING SHOULD AHVE BEEN REPLACED HERE??", current_proto );
					//_DEBUG_PARSING_DETAILS && console.log( "(need to do fromprototoypes here) object:", val, value );
					value = current_proto.protoDef.cb.call( elements, val.name, value );
					if( value ) elements[val.name] = value;
					//elements = new current_proto.protoCon( elements );
				}else {
				        //_DEBUG_PARSING_DETAILS && console.log( "Default no special class reviver", val.name, value );
					elements[val.name] = value;
				}
				//_DEBUG_PARSING_DETAILS && console.log( "Updated value:", current_class_field, val.name, elements[val.name] );
			
				//_DEBUG_PARSING && console.log( "+++ Added object field:", val.name, elements, elements[val.name], rootObject );
				RESET_VAL();
			}

			function recoverIdent(cInt) {
				//_DEBUG_PARSING&&console.log( "Recover Ident char:", cInt, val, String.fromCodePoint(cInt), "word:", word );
				if( word !== WORD_POS_RESET ) {
					if( negative ) { 
						//val.string += "-"; negative = false; 
						throwError( "Negative outside of quotes, being converted to a string (would lose count of leading '-' characters)", cInt );
					}
					switch( word ) {
					case WORD_POS_END:
						switch( val.value_type ) {
						case VALUE_TRUE:  val.string += "true"; break
						case VALUE_FALSE:  val.string += "false"; break
						case VALUE_NULL:  val.string += "null"; break
						case VALUE_INFINITY:  val.string += "Infinity"; break
						case VALUE_NEG_INFINITY:  val.string += "-Infinity"; throwError( "Negative outside of quotes, being converted to a string", cInt ); break
						case VALUE_NAN:  val.string += "NaN"; break
						case VALUE_NEG_NAN:  val.string += "-NaN"; throwError( "Negative outside of quotes, being converted to a string", cInt ); break
						case VALUE_UNDEFINED:  val.string += "undefined"; break
						case VALUE_STRING: break;
						case VALUE_UNSET: break;
						default:
							console.log( "Value of type " + val.value_type + " is not restored..." );
						}
						break;
					case WORD_POS_TRUE_1 :  val.string += "t"; break;
					case WORD_POS_TRUE_2 :  val.string += "tr"; break;
					case WORD_POS_TRUE_3 : val.string += "tru"; break;
					case WORD_POS_FALSE_1 : val.string += "f"; break;
					case WORD_POS_FALSE_2 : val.string += "fa"; break;
					case WORD_POS_FALSE_3 : val.string += "fal"; break;
					case WORD_POS_FALSE_4 : val.string += "fals"; break;
					case WORD_POS_NULL_1 : val.string += "n"; break;
					case WORD_POS_NULL_2 : val.string += "nu"; break;
					case WORD_POS_NULL_3 : val.string += "nul"; break;
					case WORD_POS_UNDEFINED_1 : val.string += "u"; break;
					case WORD_POS_UNDEFINED_2 : val.string += "un"; break;
					case WORD_POS_UNDEFINED_3 : val.string += "und"; break;
					case WORD_POS_UNDEFINED_4 : val.string += "unde"; break;
					case WORD_POS_UNDEFINED_5 : val.string += "undef"; break;
					case WORD_POS_UNDEFINED_6 : val.string += "undefi"; break;
					case WORD_POS_UNDEFINED_7 : val.string += "undefin"; break;
					case WORD_POS_UNDEFINED_8 : val.string += "undefine"; break;
					case WORD_POS_NAN_1 : val.string += "N"; break;
					case WORD_POS_NAN_2 : val.string += "Na"; break;
					case WORD_POS_INFINITY_1 : val.string += "I"; break;
					case WORD_POS_INFINITY_2 : val.string += "In"; break;
					case WORD_POS_INFINITY_3 : val.string += "Inf"; break;
					case WORD_POS_INFINITY_4 : val.string += "Infi"; break;
					case WORD_POS_INFINITY_5 : val.string += "Infin"; break;
					case WORD_POS_INFINITY_6 : val.string += "Infini"; break;
					case WORD_POS_INFINITY_7 : val.string += "Infinit"; break;
					case WORD_POS_RESET : break;
					case WORD_POS_FIELD : break;
					case WORD_POS_AFTER_FIELD:
					    //throwError( "String-keyword recovery fail (after whitespace)", cInt);
					    break;
					case WORD_POS_AFTER_FIELD_VALUE:
					    throwError( "String-keyword recovery fail (after whitespace)", cInt );
					    break;
						//console.log( "Word context: " + word + " unhandled" );
					}
					val.value_type = VALUE_STRING;									
					if( word < WORD_POS_FIELD)
					    word = WORD_POS_END;
				} else {
					word = WORD_POS_END;
					//if( val.value_type === VALUE_UNSET && val.string.length )
						val.value_type = VALUE_STRING;
				}
				if( cInt == 123/*'{'*/ )
					openObject();
				else if( cInt == 91/*'['*/ )
					openArray();
				else if( cInt == 44/*','*/ ) ; else {
					// ignore white space.
					if( cInt == 32/*' '*/ || cInt == 13 || cInt == 10 || cInt == 9 || cInt == 0xFEFF || cInt == 0x2028 || cInt == 0x2029 ) {
						//_DEBUG_WHITESPACE && console.log( "IGNORE WHITESPACE" );
						return;
					}

					if( cInt == 44/*','*/ || cInt == 125/*'}'*/ || cInt == 93/*']'*/ || cInt == 58/*':'*/ )
						throwError( "Invalid character near identifier", cInt );
					else //if( typeof cInt === "number")
						val.string += str;
				}
				//console.log( "VAL STRING IS:", val.string, str );
			}

			// gather a string from an input stream; start_c is the opening quote to find a related close quote.
			function gatherString( start_c ) {
				let retval = 0;
				while( retval == 0 && ( n < buf.length ) ) {
					str = buf.charAt(n);
					let cInt = buf.codePointAt(n++);
					if( cInt >= 0x10000 ) { str += buf.charAt(n); n++; }
					//console.log( "gathering....", stringEscape, str, cInt, unicodeWide, stringHex, stringUnicode, hex_char_len );
					pos.col++;
					if( cInt == start_c ) { //( cInt == 34/*'"'*/ ) || ( cInt == 39/*'\''*/ ) || ( cInt == 96/*'`'*/ ) )
						if( stringEscape ) { 
							if( stringHex )
								throwError( "Incomplete hexidecimal sequence", cInt );
							else if( stringUnicode )
								throwError( "Incomplete long unicode sequence", cInt );
							else if( unicodeWide )
								throwError( "Incomplete unicode sequence", cInt );
							if( cr_escaped ) {
								cr_escaped = false;
								retval = 1; // complete string, escaped \r
							} else val.string += str;
							stringEscape = false; }
						else {
							// quote matches, and is not processing an escape sequence.
							retval = 1;
						}
					}

					else if( stringEscape ) {
						if( unicodeWide ) {
							if( cInt == 125/*'}'*/ ) {
								val.string += String.fromCodePoint( hex_char );
								unicodeWide = false;
								stringUnicode = false;
								stringEscape = false;
								continue;
							}
							hex_char *= 16;
							if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ )      hex_char += cInt - 0x30;
							else if( cInt >= 65/*'A'*/ && cInt <= 70/*'F'*/ ) hex_char += ( cInt - 65 ) + 10;
							else if( cInt >= 97/*'a'*/ && cInt <= 102/*'f'*/ ) hex_char += ( cInt - 97 ) + 10;
							else {
								throwError( "(escaped character, parsing hex of \\u)", cInt );
								retval = -1;
								unicodeWide = false;
								stringEscape = false;
								continue;
							}
							continue;
						}
						else if( stringHex || stringUnicode ) {
							if( hex_char_len === 0 && cInt === 123/*'{'*/ ) {
								unicodeWide = true;
								continue;
							}
							if( hex_char_len < 2 || ( stringUnicode && hex_char_len < 4 ) ) {
								hex_char *= 16;
								if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ )      hex_char += cInt - 0x30;
								else if( cInt >= 65/*'A'*/ && cInt <= 70/*'F'*/ ) hex_char += ( cInt - 65 ) + 10;
								else if( cInt >= 97/*'a'*/ && cInt <= 102/*'f'*/ ) hex_char += ( cInt - 97 ) + 10;
								else {
									throwError( stringUnicode?"(escaped character, parsing hex of \\u)":"(escaped character, parsing hex of \\x)", cInt );
									retval = -1;
									stringHex = false;
									stringEscape = false;
									continue;
								}
								hex_char_len++;
								if( stringUnicode ) {
									if( hex_char_len == 4 ) {
										val.string += String.fromCodePoint( hex_char );
										stringUnicode = false;
										stringEscape = false;
									}
								}
								else if( hex_char_len == 2 ) {
									val.string += String.fromCodePoint( hex_char );
									stringHex = false;
									stringEscape = false;
								}
								continue;
							}
						}
						switch( cInt ) {
						case 13/*'\r'*/:
							cr_escaped = true;
							pos.col = 1;
							continue;
						case 0x2028: // LS (Line separator)
						case 0x2029: // PS (paragraph separate)
							pos.col = 1;
							// falls through
						case 10/*'\n'*/:
							if( !cr_escaped ) { // \\ \n
								pos.col = 1;
							} else { // \\ \r \n
								cr_escaped = false;
							}
							pos.line++;
							break;
						case 116/*'t'*/:
							val.string += '\t';
							break;
						case 98/*'b'*/:
							val.string += '\b';
							break;
						case 110/*'n'*/:
							val.string += '\n';
							break;
						case 114/*'r'*/:
							val.string += '\r';
							break;
						case 102/*'f'*/:
							val.string += '\f';
							break;
						case 118/*'v'*/:
							val.string += '\v';
							break;
						case 48/*'0'*/: 
							val.string += '\0';
							break;
						case 120/*'x'*/:
							stringHex = true;
							hex_char_len = 0;
							hex_char = 0;
							continue;
						case 117/*'u'*/:
							stringUnicode = true;
							hex_char_len = 0;
							hex_char = 0;
							continue;
						//case 47/*'/'*/:
						//case 92/*'\\'*/:
						//case 34/*'"'*/:
						//case 39/*"'"*/:
						//case 96/*'`'*/:
						default:
							val.string += str;
							break;
						}
						//console.log( "other..." );
						stringEscape = false;
					}
					else if( cInt === 92/*'\\'*/ ) {
						if( stringEscape ) {
							val.string += '\\';
							stringEscape = false;
						}
						else {
							stringEscape = true;
							hex_char = 0;
							hex_char_len = 0;
						}
					}
					else { /* any other character */
						if( cr_escaped ) {
							// \\ \r <any char>
							cr_escaped = false;
							pos.line++;
							pos.col = 2; // this character is pos 1; and increment to be after it.
						}
						val.string += str;
					}
				}
				return retval;
			}

			// gather a number from the input stream.
			function collectNumber() {
				let _n;
				while( (_n = n) < buf.length ) {
					str = buf.charAt(_n);
					let cInt = buf.codePointAt(n++);
					if( cInt >= 256 ) { 
							n = _n; // put character back in queue to process.
							break;
					} else {
						//_DEBUG_PARSING_NUMBERS  && console.log( "in getting number:", n, cInt, String.fromCodePoint(cInt) );
						if( cInt == 95 /*_*/ )
							continue;
						pos.col++;
						// leading zeros should be forbidden.
						if( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) {
							if( exponent ) {
								exponent_digit = true;
							}
							val.string += str;
						} else if( cInt == 45/*'-'*/ || cInt == 43/*'+'*/ ) {
							if( val.string.length == 0 || ( exponent && !exponent_sign && !exponent_digit ) ) {
								if( cInt == 45/*'-'*/ && !exponent ) negative = !negative;
								val.string += str;
								exponent_sign = true;
							} else {
								if( negative ) { val.string = '-' + val.string; negative = false; }
								val.string += str;
								date_format = true;
							}
						} else if( cInt == 78/*'N'*/ ) {
							if( word == WORD_POS_RESET ) {
								gatheringNumber = false;
								word = WORD_POS_NAN_1;
								return;
							}
							throwError( "fault while parsing number;", cInt );
							break;
						} else if( cInt == 73/*'I'*/ ) {
							if( word == WORD_POS_RESET ) {
								gatheringNumber = false;
								word = WORD_POS_INFINITY_1;
								return;
							}
							throwError( "fault while parsing number;", cInt );
							break;
						} else if( cInt == 58/*':'*/ && date_format ) {
							if( negative ) { val.string = '-' + val.string; negative = false; }
							val.string += str;
							date_format = true;
						} else if( cInt == 84/*'T'*/ && date_format ) {
							if( negative ) { val.string = '-' + val.string; negative = false; }
							val.string += str;
							date_format = true;
						} else if( cInt == 90/*'Z'*/ && date_format ) {
							if( negative ) { val.string = '-' + val.string; negative = false; }
							val.string += str;
							date_format = true;
						} else if( cInt == 46/*'.'*/ ) {
							if( !decimal && !fromHex && !exponent ) {
								val.string += str;
								decimal = true;
							} else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else if( cInt == 110/*'n'*/ ) {
							isBigInt = true;
							break;
						} else if( fromHex && ( ( ( cInt >= 95/*'a'*/ ) && ( cInt <= 102/*'f'*/ ) ) ||
						           ( ( cInt >= 65/*'A'*/ ) && ( cInt <= 70/*'F'*/ ) ) ) ) {
							val.string += str;
						} else if( cInt == 120/*'x'*/ || cInt == 98/*'b'*/ || cInt == 111/*'o'*/
								|| cInt == 88/*'X'*/ || cInt == 66/*'B'*/ || cInt == 79/*'O'*/ ) {
							// hex conversion.
							if( !fromHex && val.string == '0' ) {
								fromHex = true;
								val.string += str;
							}
							else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else if( ( cInt == 101/*'e'*/ ) || ( cInt == 69/*'E'*/ ) ) {
							if( !exponent ) {
								val.string += str;
								exponent = true;
							} else {
								status = false;
								throwError( "fault while parsing number;", cInt );
								break;
							}
						} else {
							if( cInt == 32/*' '*/ || cInt == 13 || cInt == 10 || cInt == 9 || cInt == 47/*'/'*/ || cInt ==  35/*'#'*/
							 || cInt == 44/*','*/ || cInt == 125/*'}'*/ || cInt == 93/*']'*/
							 || cInt == 123/*'{'*/ || cInt == 91/*'['*/ || cInt == 34/*'"'*/ || cInt == 39/*'''*/ || cInt == 96/*'`'*/
							 || cInt == 58/*':'*/ ) {
								n = _n; // put character back in queue to process.
								break;
							}
							else {
								if( complete_at_end ) {
									status = false;
									throwError( "fault while parsing number;", cInt );
								}
								break;
							}
						}
					}
				}
				if( (!complete_at_end) && n == buf.length ) {
					gatheringNumber = true;
				}
				else {
					gatheringNumber = false;
					val.value_type = VALUE_NUMBER;
					if( parse_context == CONTEXT_UNKNOWN ) {
						completed = true;
					}
				}
			}

			// begin parsing an object type
			function openObject() {
				let nextMode = CONTEXT_OBJECT_FIELD;
				let cls = null;
				let tmpobj = {};
				//_DEBUG_PARSING && console.log( "opening object:", val.string, val.value_type, word, parse_context );
				if( word > WORD_POS_RESET && word < WORD_POS_FIELD )
					recoverIdent( 123 /* '{' */ );
				let protoDef;
				protoDef = getProto(); // lookup classname using val.string and get protodef(if any)
				if( parse_context == CONTEXT_UNKNOWN ) {
					if( word == WORD_POS_FIELD /*|| word == WORD_POS_AFTER_FIELD*/ 
					   || word == WORD_POS_END
					     && ( protoDef || val.string.length ) ) {
							if( protoDef && protoDef.protoDef && protoDef.protoDef.protoCon ) {
								tmpobj = new protoDef.protoDef.protoCon();
							}
						if( !protoDef || !protoDef.protoDef && val.string ) // class creation is redundant...
						{
							cls = classes.find( cls=>cls.name===val.string );
							//console.log( "Probably creating the Macro-Tag here?", cls )
							if( !cls ) {
								/* eslint-disable no-inner-declarations */
								function privateProto() {} 
								// this just uses the tmpobj {} container to store the values collected for this class...
								// this does not generate the instance of the class.
								// if this tag type is also a prototype, use that prototype, else create a unique proto
								// for this tagged class type.
								classes.push( cls = { name : val.string
								, protoCon: (protoDef && protoDef.protoDef && protoDef.protoDef.protoCon) || privateProto.constructor
								 , fields : [] } );
								 nextMode = CONTEXT_CLASS_FIELD;
							} else if( redefineClass ) {
								//_DEBUG_PARSING && console.log( "redefine class..." );
								// redefine this class
								cls.fields.length = 0;
								nextMode = CONTEXT_CLASS_FIELD;
							} else {
								//_DEBUG_PARSING && console.log( "found existing class, using it....");
								tmpobj = new cls.protoCon();
								//tmpobj = Object.assign( tmpobj, cls.protoObject );
								//Object.setPrototypeOf( tmpobj, Object.getPrototypeOf( cls.protoObject ) );
								nextMode = CONTEXT_CLASS_VALUE;
							}
							redefineClass = false;
						}
						current_class = cls;
						word = WORD_POS_RESET;
					} else {
						word = WORD_POS_FIELD;
					}
				} else if( word == WORD_POS_FIELD /*|| word == WORD_POS_AFTER_FIELD*/ 
						|| parse_context === CONTEXT_IN_ARRAY 
						|| parse_context === CONTEXT_OBJECT_FIELD_VALUE 
						|| parse_context == CONTEXT_CLASS_VALUE ) {
					if( word != WORD_POS_RESET || val.value_type == VALUE_STRING ) {
						if( protoDef && protoDef.protoDef ) {
							// need to collect the object,
							tmpobj = new protoDef.protoDef.protoCon();
						} else {
							// look for a class type (shorthand) to recover.
							cls = classes.find( cls=>cls.name === val.string );
							if( !cls )
							{
								/* eslint-disable no-inner-declarations */
							   function privateProto(){}
								//sconsole.log( "privateProto has no proto?", privateProto.prototype.constructor.name );
								localFromProtoTypes.set( val.string,
														{ protoCon:privateProto.prototype.constructor
														, cb: null }
													   );
								tmpobj = new privateProto();
							}
							else {
								nextMode = CONTEXT_CLASS_VALUE;
								tmpobj = {};
							}
						}
						//nextMode = CONTEXT_CLASS_VALUE;
						word = WORD_POS_RESET;
					} else {
						word = WORD_POS_RESET;
					}
				} else if( ( parse_context == CONTEXT_OBJECT_FIELD && word == WORD_POS_RESET ) ) {
					throwError( "fault while parsing; getting field name unexpected ", cInt );
					status = false;
					return false;
				}

				// common code to push into next context
				let old_context = getContext();
				//_DEBUG_PARSING && console.log( "Begin a new object; previously pushed into elements; but wait until trailing comma or close previously ", val.value_type, val.className );

				val.value_type = VALUE_OBJECT;
				if( parse_context === CONTEXT_UNKNOWN ){
					elements = tmpobj;
				} else if( parse_context == CONTEXT_IN_ARRAY ) {
					val.name = elements.length;
					//else if( //_DEBUG_PARSING && arrayType !== -3 )
					//	console.log( "This is an invalid parsing state, typed array with sub-object elements" );
				} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE || parse_context == CONTEXT_CLASS_VALUE ) {
					if( !val.name && current_class ){
						val.name = current_class.fields[current_class_field++];
						//_DEBUG_PARSING_DETAILS && console.log( "B Stepping current class field:", val, current_class_field, val.name );
					}
					//_DEBUG_PARSING_DETAILS && console.log( "Setting element:", val.name, tmpobj );
					elements[val.name] = tmpobj;
				}

				old_context.context = parse_context;
				old_context.elements = elements;
				//old_context.element_array = element_array;
				old_context.name = val.name;
				//_DEBUG_PARSING_DETAILS && console.log( "pushing val.name:", val.name, arrayType );
				old_context.current_proto = current_proto;
				old_context.current_class = current_class;
				old_context.current_class_field = current_class_field;
				old_context.valueType = val.value_type;
				old_context.arrayType = arrayType; // pop that we don't want to have this value re-pushed.
				old_context.className = val.className;
				//arrayType = -3; // this doesn't matter, it's an object state, and a new array will reset to -1
				val.className = null;
				val.name = null;
				current_proto = protoDef;
				current_class = cls;
				//console.log( "Setting current class:", current_class.name );
				current_class_field = 0;
				elements = tmpobj;
				if( !rootObject ) rootObject = elements;
				//_DEBUG_PARSING_STACK && console.log( "push context (open object): ", context_stack.length, " new mode:", nextMode );
				context_stack.push( old_context );
				//_DEBUG_PARSING_DETAILS && console.log( "RESET OBJECT FIELD", old_context, context_stack );
				RESET_VAL();
				parse_context = nextMode;
				return true;
			}

			function openArray() {
				//_DEBUG_PARSING_DETAILS && console.log( "openArray()..." );
				if( word > WORD_POS_RESET && word < WORD_POS_FIELD )
					recoverIdent( 91 );

				if( word == WORD_POS_END && val.string.length ) {
					//_DEBUG_PARSING && console.log( "recover arrayType:", arrayType, val.string );
					let typeIndex = knownArrayTypeNames.findIndex( type=>(type === val.string) );
					word = WORD_POS_RESET;
					if( typeIndex >= 0 ) {
						arrayType = typeIndex;
						val.className = val.string;
						val.string = null;
					} else {
						if( val.string === "ref" ) {
							val.className = null;
							//_DEBUG_PARSING_DETAILS && console.log( "This will be a reference recovery for key:", val );
							arrayType = -2;
						} else {
							if( localFromProtoTypes.get( val.string ) ) {
								val.className = val.string;
							} 
							else if( fromProtoTypes.get( val.string ) ) {
								val.className = val.string;
							} else
								throwError( `Unknown type '${val.string}' specified for array`, cInt );
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!A Set Classname:", val.className );
						}
					}
				} else if( parse_context == CONTEXT_OBJECT_FIELD || word == WORD_POS_FIELD || word == WORD_POS_AFTER_FIELD ) {
					throwError( "Fault while parsing; while getting field name unexpected", cInt );
					status = false;
					return false;
				}
				{
					let old_context = getContext();
					//_DEBUG_PARSING && console.log( "Begin a new array; previously pushed into elements; but wait until trailing comma or close previously ", val.value_type );

					//_DEBUG_PARSING_DETAILS && console.log( "Opening array:", val, parse_context );
					val.value_type = VALUE_ARRAY;
					let tmparr = [];
					if( parse_context == CONTEXT_UNKNOWN )
						elements = tmparr;
					else if( parse_context == CONTEXT_IN_ARRAY ) {
						if( arrayType == -1 ){
							//console.log( "Pushing new opening array into existing array already RE-SET" );
							elements.push( tmparr );
						} //else if( //_DEBUG_PARSING && arrayType !== -3 )
						val.name = elements.length;
						//	console.log( "This is an invalid parsing state, typed array with sub-array elements" );
					} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
						if( !val.name ) {
							console.log( "This says it's resolved......." );
							arrayType = -3;
						}

						if( current_proto && current_proto.protoDef ) {
							//_DEBUG_PARSING_DETAILS && console.log( "SOMETHING SHOULD HAVE BEEN REPLACED HERE??", current_proto );
							//_DEBUG_PARSING_DETAILS && console.log( "(need to do fromprototoypes here) object:", val, value );
							if( current_proto.protoDef.cb ){
								const newarr = current_proto.protoDef.cb.call( elements, val.name, tmparr );
								if( newarr !== undefined ) tmparr = elements[val.name] = newarr;
								//else console.log( "Warning: Received undefined for an array; keeping original array, not setting field" );
							}else
								elements[val.name] = tmparr;
						}
						else
							elements[val.name] = tmparr;
					}
					old_context.context = parse_context;
					old_context.elements = elements;
					//old_context.element_array = element_array;
					old_context.name = val.name;
					old_context.current_proto = current_proto;
					old_context.current_class = current_class;
					old_context.current_class_field = current_class_field;
					// already pushed?
					old_context.valueType = val.value_type;
					old_context.arrayType = (arrayType==-1)?-3:arrayType; // pop that we don't want to have this value re-pushed.
					old_context.className = val.className;
					arrayType = -1;
					val.className = null;

					//_DEBUG_PARSING_DETAILS && console.log( " !!!!!B Clear Classname:", old_context, val.className, old_context.className, old_context.name );
					val.name = null;
					current_proto = null;
					current_class = null;
					current_class_field = 0;
					//element_array = tmparr;
					elements = tmparr;
					if( !rootObject ) rootObject = tmparr;
					//_DEBUG_PARSING_STACK && console.log( "push context (open array): ", context_stack.length );
					context_stack.push( old_context );
					//_DEBUG_PARSING_DETAILS && console.log( "RESET ARRAY FIELD", old_context, context_stack );

					RESET_VAL();
					parse_context = CONTEXT_IN_ARRAY;
				}
				return true;
			}

			function getProto() {
				const result = {protoDef:null,cls:null};
				if( ( result.protoDef = localFromProtoTypes.get( val.string ) ) ) {
					if( !val.className ){
						val.className = val.string;
						val.string = null;
					}
					// need to collect the object, 
				}
				else if( ( result.protoDef = fromProtoTypes.get( val.string ) ) ) {
					if( !val.className ){
						val.className = val.string;
						val.string = null;
					}
				} 
				if( val.string )
				{
					result.cls = classes.find( cls=>cls.name === val.string );
					if( !result.protoDef && !result.cls ) ;
				}
				return (result.protoDef||result.cls)?result:null;
			}

			if( !status )
				return -1;

			if( msg && msg.length ) {
				input = getBuffer();
				input.buf = msg;
				inQueue.push( input );
			} else {
				if( gatheringNumber ) {
					//console.log( "Force completed.")
					gatheringNumber = false;
					val.value_type = VALUE_NUMBER;
					if( parse_context == CONTEXT_UNKNOWN ) {
						completed = true;
					}
					retval = 1;  // if returning buffers, then obviously there's more in this one.
				}
				if( parse_context !== CONTEXT_UNKNOWN )
					throwError( "Unclosed object at end of stream.", cInt );
			}

			while( status && ( input = inQueue.shift() ) ) {
				n = input.n;
				buf = input.buf;
				if( gatheringString ) {
					let string_status = gatherString( gatheringStringFirstChar );
					if( string_status < 0 )
						status = false;
					else if( string_status > 0 ) {
						gatheringString = false;
						if( status ) val.value_type = VALUE_STRING;
					}
				}
				if( gatheringNumber ) {
					collectNumber();
				}

				while( !completed && status && ( n < buf.length ) ) {
					str = buf.charAt(n);
					cInt = buf.codePointAt(n++);
					if( cInt >= 0x10000 ) { str += buf.charAt(n); n++; }
					//_DEBUG_PARSING && console.log( "parsing at ", cInt, str );
					//_DEBUG_LL && console.log( "processing: ", cInt, n, str, pos, comment, parse_context, word );
					pos.col++;
					if( comment ) {
						if( comment == 1 ) {
							if( cInt == 42/*'*'*/ ) comment = 3;
							else if( cInt != 47/*'/'*/ ) return throwError( "fault while parsing;", cInt );
							else comment = 2;
						}
						else if( comment == 2 ) {
							if( cInt == 10/*'\n'*/ || cInt == 13/*'\r'*/  ) comment = 0;
						}
						else if( comment == 3 ) {
							if( cInt == 42/*'*'*/ ) comment = 4;
						}
						else {
							if( cInt == 47/*'/'*/ ) comment = 0;
							else comment = 3;
						}
						continue;
					}
					switch( cInt ) {
					case 47/*'/'*/:
						comment = 1;
						break;
					case 123/*'{'*/:
						openObject();
						break;
					case 91/*'['*/:
						openArray();
						break;

					case 58/*':'*/:
						//_DEBUG_PARSING && console.log( "colon received...")
						if( parse_context == CONTEXT_CLASS_VALUE ) {
							word = WORD_POS_RESET;
							val.name = val.string;
							val.string = '';
							val.value_type = VALUE_UNSET;
							
						} else if( parse_context == CONTEXT_OBJECT_FIELD
							|| parse_context == CONTEXT_CLASS_FIELD  ) {
							if( parse_context == CONTEXT_CLASS_FIELD ) {
								if( !Object.keys( elements).length ) {
									 console.log( "This is a full object, not a class def...", val.className );
								const privateProto = ()=>{}; 
								localFromProtoTypes.set( context_stack.last.node.current_class.name,
														{ protoCon:privateProto.prototype.constructor
														, cb: null }
													   );
								elements = new privateProto();
								parse_context = CONTEXT_OBJECT_FIELD_VALUE;
								val.name = val.string;
								word = WORD_POS_RESET;
								val.string = '';
								val.value_type = VALUE_UNSET;
								console.log( "don't do default;s do a revive..." );
								}
							} else {
								if( word != WORD_POS_RESET
								   && word != WORD_POS_END
								   && word != WORD_POS_FIELD
								   && word != WORD_POS_AFTER_FIELD ) {
									recoverIdent( 32 );
									// allow starting a new word
									//status = false;
									//throwError( `fault while parsing; unquoted keyword used as object field name (state:${word})`, cInt );
									//break;
								}
								word = WORD_POS_RESET;
								val.name = val.string;
								val.string = '';
								parse_context = (parse_context===CONTEXT_OBJECT_FIELD)?CONTEXT_OBJECT_FIELD_VALUE:CONTEXT_CLASS_FIELD_VALUE;
								val.value_type = VALUE_UNSET;
							}
						}
						else if( parse_context == CONTEXT_UNKNOWN ){
							console.log( "Override colon found, allow class redefinition", parse_context );
							redefineClass = true;
							break;
						} else {
							if( parse_context == CONTEXT_IN_ARRAY )
								throwError(  "(in array, got colon out of string):parsing fault;", cInt );
							else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ){
								throwError( "String unexpected", cInt );
							} else
								throwError( "(outside any object, got colon out of string):parsing fault;", cInt );
							status = false;
						}
						break;
					case 125/*'}'*/:
						//_DEBUG_PARSING && console.log( "close bracket context:", word, parse_context, val.value_type, val.string );
						if( word == WORD_POS_END ) {
							// allow starting a new word
							word = WORD_POS_RESET;
						}
						// coming back after pushing an array or sub-object will reset the contxt to FIELD, so an end with a field should still push value.
						if( parse_context == CONTEXT_CLASS_FIELD ) {
							if( current_class ) {
								// allow blank comma at end to not be a field
								if(val.string) { current_class.fields.push( val.string ); }

								RESET_VAL();
								let old_context = context_stack.pop();
								//_DEBUG_PARSING_DETAILS && console.log( "close object:", old_context, context_stack );
								//_DEBUG_PARSING_STACK && console.log( "object pop stack (close obj)", context_stack.length, old_context );
								parse_context = CONTEXT_UNKNOWN; // this will restore as IN_ARRAY or OBJECT_FIELD
								word = WORD_POS_RESET;
								val.name = old_context.name;
								elements = old_context.elements;
								//element_array = old_context.element_array;
								current_class = old_context.current_class;
								current_class_field = old_context.current_class_field;
								//_DEBUG_PARSING_DETAILS && console.log( "A Pop old class field counter:", current_class_field, val.name );
								arrayType = old_context.arrayType;
								val.value_type = old_context.valueType;
								val.className = old_context.className;
								//_DEBUG_PARSING_DETAILS && console.log( " !!!!!C Pop Classname:", val.className );
								rootObject = null;

								dropContext( old_context );
							} else {
								throwError( "State error; gathering class fields, and lost the class", cInt );
							}
						} else if( ( parse_context == CONTEXT_OBJECT_FIELD ) || ( parse_context == CONTEXT_CLASS_VALUE ) ) {
							if( val.value_type != VALUE_UNSET ) {
								if( current_class ) {
									//_DEBUG_PARSING_DETAILS && console.log( "C Stepping current class field:", current_class_field, val.name, arrayType );
									val.name = current_class.fields[current_class_field++];
								}
								//_DEBUG_PARSING && console.log( "Closing object; set value name, and push...", current_class_field, val );
								objectPush();
							}
							//_DEBUG_PARSING && console.log( "close object; empty object", val, elements );

								val.value_type = VALUE_OBJECT;
								if( current_proto && current_proto.protoDef ) {
									console.log( "SOMETHING SHOULD AHVE BEEN REPLACED HERE??", current_proto );
									console.log( "The other version only revives on init" );
									elements = new current_proto.protoDef.cb( elements, undefined, undefined );
									//elements = new current_proto.protoCon( elements );
								}
								val.contains = elements;
								val.string = "";

							let old_context = context_stack.pop();
							//_DEBUG_PARSING_STACK && console.log( "object pop stack (close obj)", context_stack.length, old_context );
							parse_context = old_context.context; // this will restore as IN_ARRAY or OBJECT_FIELD
							val.name = old_context.name;
							elements = old_context.elements;
							//element_array = old_context.element_array;
							current_class = old_context.current_class;
							current_proto = old_context.current_proto;
							current_class_field = old_context.current_class_field;
							//_DEBUG_PARSING_DETAILS && console.log( "B Pop old class field counter:", context_stack, current_class_field, val.name );
							arrayType = old_context.arrayType;
							val.value_type = old_context.valueType;
							val.className = old_context.className;
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!D Pop Classname:", val.className );
							dropContext( old_context );

							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						}
						else if( ( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) ) {
							// first, add the last value
							//_DEBUG_PARSING && console.log( "close object; push item '%s' %d", val.name, val.value_type );
							if( val.value_type === VALUE_UNSET ) {
								throwError( "Fault while parsing; unexpected", cInt );
							}
							objectPush();
							val.value_type = VALUE_OBJECT;
							val.contains = elements;
							word = WORD_POS_RESET;

							//let old_context = context_stack.pop();
							let old_context = context_stack.pop();
							//_DEBUG_PARSING_STACK  && console.log( "object pop stack (close object)", context_stack.length, old_context );
							parse_context = old_context.context; // this will restore as IN_ARRAY or OBJECT_FIELD
							val.name = old_context.name;
							elements = old_context.elements;
							current_proto = old_context.current_proto;
							current_class = old_context.current_class;
							current_class_field = old_context.current_class_field;
							//_DEBUG_PARSING_DETAILS && console.log( "C Pop old class field counter:", context_stack, current_class_field, val.name );
							arrayType = old_context.arrayType;
							val.value_type = old_context.valueType;
							val.className = old_context.className;
							//_DEBUG_PARSING_DETAILS && console.log( " !!!!!E Pop Classname:", val.className );
							//element_array = old_context.element_array;
							dropContext( old_context );
							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						}
						else {
							throwError( "Fault while parsing; unexpected", cInt );
							status = false;
						}
						negative = false;
						break;
					case 93/*']'*/:
						if( word >= WORD_POS_AFTER_FIELD ) {
							word = WORD_POS_RESET;
						}
						if( parse_context == CONTEXT_IN_ARRAY ) {
							
							//_DEBUG_PARSING  && console.log( "close array, push last element: %d", val.value_type );
							if( val.value_type != VALUE_UNSET ) {
								// name is set when saving a context.
								// a better sanity check would be val.name === elements.length;
								//if( val.name ) if( val.name !== elements.length ) console.log( "Ya this should blow up" );
								arrayPush();
							}
							val.contains = elements;
							{
								let old_context = context_stack.pop();
								//_DEBUG_PARSING_STACK  && console.log( "object pop stack (close array)", context_stack.length );
								val.name = old_context.name;
								val.className = old_context.className;
								parse_context = old_context.context;
								elements = old_context.elements;
								//element_array = old_context.element_array;
								current_proto = old_context.current_proto;
								current_class = old_context.current_class;
								current_class_field = old_context.current_class_field;
								arrayType = old_context.arrayType;
								val.value_type = old_context.valueType;
								//_DEBUG_PARSING_DETAILS && console.log( "close array:", old_context );
								//_DEBUG_PARSING_DETAILS && console.log( "D Pop old class field counter:", context_stack, current_class_field, val );
								dropContext( old_context );
							}
							val.value_type = VALUE_ARRAY;
							if( parse_context == CONTEXT_UNKNOWN ) {
								completed = true;
							}
						} else {
							throwError( `bad context ${parse_context}; fault while parsing`, cInt );// fault
							status = false;
						}
						negative = false;
						break;
					case 44/*','*/:
						if( word < WORD_POS_AFTER_FIELD && word != WORD_POS_RESET ) {
							recoverIdent(cInt);
						}
						if( word == WORD_POS_END || word == WORD_POS_FIELD ) word = WORD_POS_RESET;  // allow collect new keyword
						//if(//_DEBUG_PARSING) 
						//_DEBUG_PARSING_DETAILS && console.log( "comma context:", parse_context, val );
						if( parse_context == CONTEXT_CLASS_FIELD ) {
							if( current_class ) {
								//console.log( "Saving field name(set word to IS A FIELD):", val.string );
								current_class.fields.push( val.string );
								val.string = '';
								word = WORD_POS_FIELD;
							} else {
								throwError( "State error; gathering class fields, and lost the class", cInt );
							}
						} else if( parse_context == CONTEXT_OBJECT_FIELD ) {
							if( current_class ) {
								//_DEBUG_PARSING_DETAILS && console.log( "D Stepping current class field:", current_class_field, val.name );
								val.name = current_class.fields[current_class_field++];
								//_DEBUG_PARSING && console.log( "should have a completed value at a comma.:", current_class_field, val );
								if( val.value_type != VALUE_UNSET ) {
									//_DEBUG_PARSING  && console.log( "pushing object field:", val );
									objectPush();
									RESET_VAL();
								}
							} else {
								// this is an empty comma...
								if( val.string || val.value_type )
									throwError( "State error; comma in field name and/or lost the class", cInt );
							}
						} else if( parse_context == CONTEXT_CLASS_VALUE ) {
							if( current_class ) {
								//_DEBUG_PARSING_DETAILS && console.log( "reviving values in class...", arrayType, current_class.fields[current_class_field ], val );
								if( arrayType != -3 && !val.name ) {
									// this should have still had a name....
									//_DEBUG_PARSING_DETAILS && console.log( "E Stepping current class field:", current_class_field, val, arrayType );
									val.name = current_class.fields[current_class_field++];
									//else val.name = current_class.fields[current_class_field++];
								}
								//_DEBUG_PARSING && console.log( "should have a completed value at a comma.:", current_class_field, val );
								if( val.value_type != VALUE_UNSET ) {
									if( arrayType != -3 )
										objectPush();
									RESET_VAL();
								}
							} else {
								
								if( val.value_type != VALUE_UNSET ) {
									objectPush();
									RESET_VAL();
								}
								//throwError( "State error; gathering class values, and lost the class", cInt );
							}
							val.name = null;
						} else if( parse_context == CONTEXT_IN_ARRAY ) {
							if( val.value_type == VALUE_UNSET )
								val.value_type = VALUE_EMPTY; // in an array, elements after a comma should init as undefined...

							//_DEBUG_PARSING  && console.log( "back in array; push item %d", val.value_type );
							arrayPush();
							RESET_VAL();
							word = WORD_POS_RESET;
							// undefined allows [,,,] to be 4 values and [1,2,3,] to be 4 values with an undefined at end.
						} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE && val.value_type != VALUE_UNSET ) {
							// after an array value, it will have returned to OBJECT_FIELD anyway
							//_DEBUG_PARSING  && console.log( "comma after field value, push field to object: %s", val.name, val.value_type );
							parse_context = CONTEXT_OBJECT_FIELD;
							if( val.value_type != VALUE_UNSET ) {
								objectPush();
								RESET_VAL();
							}
							word = WORD_POS_RESET;
						} else {
							status = false;
							throwError( "bad context; excessive commas while parsing;", cInt );// fault
						}
						negative = false;
						break;

					default:
						switch( cInt ) {
						default:
						if( ( parse_context == CONTEXT_UNKNOWN )
						  || ( parse_context == CONTEXT_OBJECT_FIELD_VALUE && word == WORD_POS_FIELD )
						  || ( ( parse_context == CONTEXT_OBJECT_FIELD ) || word == WORD_POS_FIELD )
						  || ( parse_context == CONTEXT_CLASS_FIELD ) ) {
							switch( cInt ) {
							case 96://'`':
							case 34://'"':
							case 39://'\'':
								if( word == WORD_POS_RESET || word == WORD_POS_FIELD ) {
									if( val.string.length ) {
										console.log( "IN ARRAY AND FIXING?" );
										val.className = val.string;
										val.string = '';
									}
									let string_status = gatherString(cInt );
									//_DEBUG_PARSING && console.log( "string gather for object field name :", val.string, string_status );
									if( string_status ) {
										val.value_type = VALUE_STRING;
									} else {
										gatheringStringFirstChar = cInt;
										gatheringString = true;
									}
								} else {
									throwError( "fault while parsing; quote not at start of field name", cInt );
								}

								break;
							case 10://'\n':
								pos.line++;
								pos.col = 1;
								// fall through to normal space handling - just updated line/col position
							case 13://'\r':
							case 32://' ':
							case 0x2028://' ':
							case 0x2029://' ':
							case 9://'\t':
							case 0xFEFF: // ZWNBS is WS though
								 //_DEBUG_WHITESPACE  && console.log( "THIS SPACE", word, parse_context, val );
								if( parse_context === CONTEXT_UNKNOWN && word === WORD_POS_END ) { // allow collect new keyword
									word = WORD_POS_RESET;
									if( parse_context === CONTEXT_UNKNOWN ) {
										completed = true;
									}
									break;
								}
								if( word === WORD_POS_RESET || word === WORD_POS_AFTER_FIELD ) { // ignore leading and trailing whitepsace
									if( parse_context == CONTEXT_UNKNOWN && val.value_type ) {
										completed = true;
									}
									break;
								}
								else if( word === WORD_POS_FIELD ) {
									if( parse_context === CONTEXT_UNKNOWN ) {
										word = WORD_POS_RESET;
										completed = true;
										break;
									}
									if( val.string.length )
										console.log( "STEP TO NEXT TOKEN." );
										word = WORD_POS_AFTER_FIELD;
										//val.className = val.string; val.string = '';
								}
								else {
									status = false;
									throwError( "fault while parsing; whitepsace unexpected", cInt );
								}
								// skip whitespace
								break;
							default:
								//console.log( "TICK" );
								if( word == WORD_POS_RESET && ( ( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) || ( cInt == 43/*'+'*/ ) || ( cInt == 46/*'.'*/ ) || ( cInt == 45/*'-'*/ ) ) ) {
									fromHex = false;
									exponent = false;
									date_format = false;
									isBigInt = false;

									exponent_sign = false;
									exponent_digit = false;
									decimal = false;
									val.string = str;
									input.n = n;
									collectNumber();
									break;
								}

								if( word === WORD_POS_AFTER_FIELD ) {
									status = false;
									throwError( "fault while parsing; character unexpected", cInt );
								}
								if( word === WORD_POS_RESET ) {
									word = WORD_POS_FIELD;
									val.value_type = VALUE_STRING;
									val.string += str;
									//_DEBUG_PARSING  && console.log( "START/CONTINUE IDENTIFER" );
									break;

								}     
								if( val.value_type == VALUE_UNSET ) {
									if( word !== WORD_POS_RESET && word !== WORD_POS_END )
										recoverIdent( cInt );
								} else {
									if( word === WORD_POS_END || word === WORD_POS_FIELD ) {
										// final word of the line... 
										// whispace changes the 'word' state to not 'end'
										// until the next character, which may restore it to
										// 'end' and this will resume collecting the same string.
										val.string += str;
										break;
									}
									if( parse_context == CONTEXT_OBJECT_FIELD ) {
										if( word == WORD_POS_FIELD ) {
											val.string+=str;
											break;
										}
										throwError( "Multiple values found in field name", cInt );
									}
									if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
										throwError( "String unexpected", cInt );
									}
								}
								break; // default
							}
							
						}else {
							if( word == WORD_POS_RESET && ( ( cInt >= 48/*'0'*/ && cInt <= 57/*'9'*/ ) || ( cInt == 43/*'+'*/ ) || ( cInt == 46/*'.'*/ ) || ( cInt == 45/*'-'*/ ) ) ) {
								fromHex = false;
								exponent = false;
								date_format = false;
								isBigInt = false;

								exponent_sign = false;
								exponent_digit = false;
								decimal = false;
								val.string = str;
								input.n = n;
								collectNumber();
							} else {
								//console.log( "TICK")
								if( val.value_type == VALUE_UNSET ) {
									if( word != WORD_POS_RESET ) {
										recoverIdent( cInt );
									} else {
										word = WORD_POS_END;
										val.string += str;
										val.value_type = VALUE_STRING;
									}
								} else {
									if( parse_context == CONTEXT_OBJECT_FIELD ) {
										throwError( "Multiple values found in field name", cInt );
									}
									else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {

										if( val.value_type != VALUE_STRING ) {
											if( val.value_type == VALUE_OBJECT || val.value_type == VALUE_ARRAY ){
												throwError( "String unexpected", cInt );
											}
											recoverIdent(cInt);
										}
										if( word == WORD_POS_AFTER_FIELD ){
											const  protoDef = getProto();
											if( protoDef){
												val.string = str;
											}
											else 
												throwError( "String unexpected", cInt );
										} else {
											if( word == WORD_POS_END ) {
												val.string += str;
											}else
												throwError( "String unexpected", cInt );
										}
									}
									else if( parse_context == CONTEXT_IN_ARRAY ) {
										if( word == WORD_POS_AFTER_FIELD ){
											if( !val.className ){
												//	getProto()
												val.className = val.string;
												val.string = '';
											}
											val.string += str;
											break;
										} else {
											if( word == WORD_POS_END )
												val.string += str;
										}

									}
								}
								
								//recoverIdent(cInt);
							}
							break; // default
						}
						break;
						case 96://'`':
						case 34://'"':
						case 39://'\'':
						{
							if( val.string ) val.className = val.string; val.string = '';
							let string_status = gatherString( cInt );
							//_DEBUG_PARSING && console.log( "string gather for object field value :", val.string, string_status, completed, input.n, buf.length );
							if( string_status ) {
								val.value_type = VALUE_STRING;
								word = WORD_POS_END;
							} else {
								gatheringStringFirstChar = cInt;
								gatheringString = true;
							}
							break;
						}
						case 10://'\n':
							pos.line++;
							pos.col = 1;
							//falls through
						case 32://' ':
						case 9://'\t':
						case 13://'\r':
						case 0x2028: // LS (Line separator)
						case 0x2029: // PS (paragraph separate)
						case 0xFEFF://'\uFEFF':
							//_DEBUG_WHITESPACE && console.log( "Whitespace...", word, parse_context );
							if( word == WORD_POS_END ) {
								if( parse_context == CONTEXT_UNKNOWN ) {
									word = WORD_POS_RESET;
									completed = true;
									break;
								} else if( parse_context == CONTEXT_OBJECT_FIELD_VALUE ) {
									word = WORD_POS_AFTER_FIELD_VALUE;
									break;
								} else if( parse_context == CONTEXT_OBJECT_FIELD ) {
									word = WORD_POS_AFTER_FIELD;
									break;
								} else if( parse_context == CONTEXT_IN_ARRAY ) {
									word = WORD_POS_AFTER_FIELD;
									break;
								}
							}
							if( word == WORD_POS_RESET || ( word == WORD_POS_AFTER_FIELD ))
								break;
							else if( word == WORD_POS_FIELD ) {
								if( val.string.length )
									word = WORD_POS_AFTER_FIELD;
							}
							else {
								if( word < WORD_POS_END ) 
									recoverIdent( cInt );
							}
							break;
					//----------------------------------------------------------
					//  catch characters for true/false/null/undefined which are values outside of quotes
						case 116://'t':
							if( word == WORD_POS_RESET ) word = WORD_POS_TRUE_1;
							else if( word == WORD_POS_INFINITY_6 ) word = WORD_POS_INFINITY_7;
							else { recoverIdent(cInt); }// fault
							break;
						case 114://'r':
							if( word == WORD_POS_TRUE_1 ) word = WORD_POS_TRUE_2;
							else { recoverIdent(cInt); }// fault
							break;
						case 117://'u':
							if( word == WORD_POS_TRUE_2 ) word = WORD_POS_TRUE_3;
							else if( word == WORD_POS_NULL_1 ) word = WORD_POS_NULL_2;
							else if( word == WORD_POS_RESET ) word = WORD_POS_UNDEFINED_1;
							else { recoverIdent(cInt); }// fault
							break;
						case 101://'e':
							if( word == WORD_POS_TRUE_3 ) {
								val.value_type = VALUE_TRUE;
								word = WORD_POS_END;
							} else if( word == WORD_POS_FALSE_4 ) {
								val.value_type = VALUE_FALSE;
								word = WORD_POS_END;
							} else if( word == WORD_POS_UNDEFINED_3 ) word = WORD_POS_UNDEFINED_4;
							else if( word == WORD_POS_UNDEFINED_7 ) word = WORD_POS_UNDEFINED_8;
							else { recoverIdent(cInt); }// fault
							break;
						case 110://'n':
							if( word == WORD_POS_RESET ) word = WORD_POS_NULL_1;
							else if( word == WORD_POS_UNDEFINED_1 ) word = WORD_POS_UNDEFINED_2;
							else if( word == WORD_POS_UNDEFINED_6 ) word = WORD_POS_UNDEFINED_7;
							else if( word == WORD_POS_INFINITY_1 ) word = WORD_POS_INFINITY_2;
							else if( word == WORD_POS_INFINITY_4 ) word = WORD_POS_INFINITY_5;
							else { recoverIdent(cInt); }// fault
							break;
						case 100://'d':
							if( word == WORD_POS_UNDEFINED_2 ) word = WORD_POS_UNDEFINED_3;
							else if( word == WORD_POS_UNDEFINED_8 ) { val.value_type=VALUE_UNDEFINED; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 105://'i':
							if( word == WORD_POS_UNDEFINED_5 ) word = WORD_POS_UNDEFINED_6;
							else if( word == WORD_POS_INFINITY_3 ) word = WORD_POS_INFINITY_4;
							else if( word == WORD_POS_INFINITY_5 ) word = WORD_POS_INFINITY_6;
							else { recoverIdent(cInt); }// fault
							break;
						case 108://'l':
							if( word == WORD_POS_NULL_2 ) word = WORD_POS_NULL_3;
							else if( word == WORD_POS_NULL_3 ) {
								val.value_type = VALUE_NULL;
								word = WORD_POS_END;
							} else if( word == WORD_POS_FALSE_2 ) word = WORD_POS_FALSE_3;
							else { recoverIdent(cInt); }// fault
							break;
						case 102://'f':
							if( word == WORD_POS_RESET ) word = WORD_POS_FALSE_1;
							else if( word == WORD_POS_UNDEFINED_4 ) word = WORD_POS_UNDEFINED_5;
							else if( word == WORD_POS_INFINITY_2 ) word = WORD_POS_INFINITY_3;
							else { recoverIdent(cInt); }// fault
							break;
						case 97://'a':
							if( word == WORD_POS_FALSE_1 ) word = WORD_POS_FALSE_2;
							else if( word == WORD_POS_NAN_1 ) word = WORD_POS_NAN_2;
							else { recoverIdent(cInt); }// fault
							break;
						case 115://'s':
							if( word == WORD_POS_FALSE_3 ) word = WORD_POS_FALSE_4;
							else { recoverIdent(cInt); }// fault
							break;
						case 73://'I':
							if( word == WORD_POS_RESET ) word = WORD_POS_INFINITY_1;
							else { recoverIdent(cInt); }// fault
							break;
						case 78://'N':
							if( word == WORD_POS_RESET ) word = WORD_POS_NAN_1;
							else if( word == WORD_POS_NAN_2 ) { val.value_type = negative ? VALUE_NEG_NAN : VALUE_NAN; negative = false; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 121://'y':
							if( word == WORD_POS_INFINITY_7 ) { val.value_type = negative ? VALUE_NEG_INFINITY : VALUE_INFINITY; negative = false; word = WORD_POS_END; }
							else { recoverIdent(cInt); }// fault
							break;
						case 45://'-':
							if( word == WORD_POS_RESET ) negative = !negative;
							else { recoverIdent(cInt); }// fault
							break;
						case 43://'+':
							if( word !== WORD_POS_RESET ) { recoverIdent(cInt); }
							break;
						}
						break; // default of high level switch
					//
					//----------------------------------------------------------
					}
					if( completed ) {
						if( word == WORD_POS_END ) {
							word = WORD_POS_RESET;
						}
						break;
					}
				}

				if( n == buf.length ) {
					dropBuffer( input );
					if( gatheringString || gatheringNumber || parse_context == CONTEXT_OBJECT_FIELD ) {
						retval = 0;
					}
					else {
						if( parse_context == CONTEXT_UNKNOWN && ( val.value_type != VALUE_UNSET || result ) ) {
							completed = true;
							retval = 1;
						}
					}
				}
				else {
					// put these back into the stack.
					input.n = n;
					inQueue.unshift( input );
					retval = 2;  // if returning buffers, then obviously there's more in this one.
				}
				if( completed ) {
					rootObject = null;
					break;
				}
			}

			if( !status ) return -1;
			if( completed && val.value_type != VALUE_UNSET ) {
				word = WORD_POS_RESET;
				result = convertValue();
				//_DEBUG_PARSING && console.log( "Result(3):", result );
				negative = false;
				val.string = '';
				val.value_type = VALUE_UNSET;
			}
			completed = false;
			return retval;
		}
	}
};



const _parser = [Object.freeze( JSOX.begin() )];
let _parse_level = 0;
/**
 * @param {string} msg 
 * @param {(this: unknown, key: string, value: unknown) => any} [reviver] 
 * @returns {unknown}
 */
JSOX.parse = function( msg, reviver ) {
	let parse_level = _parse_level++;
	let parser;
	if( _parser.length <= parse_level )
		_parser.push( Object.freeze( JSOX.begin() ) );
	parser = _parser[parse_level];
	if (typeof msg !== "string") msg = String(msg);
	parser.reset();
	const writeResult = parser._write( msg, true );
	if( writeResult > 0 ) {
		let result = parser.value();
		if( ( "undefined" === typeof result ) && writeResult > 1 ){
			throw new Error( "Pending value could not complete");
		}

		result = typeof reviver === 'function' ? (function walk(holder, key) {
			let k, v, value = holder[key];
			if (value && typeof value === 'object') {
				for (k in value) {
					if (Object.prototype.hasOwnProperty.call(value, k)) {
						v = walk(value, k);
						if (v !== undefined) {
							value[k] = v;
						} else {
							delete value[k];
						}
					}
				}
			}
			return reviver.call(holder, key, value);
		}({'': result}, '')) : result;
		_parse_level--;
		return result;
	}
	parser.finalError();
	return undefined;
};


function this_value() {/*//_DEBUG_STRINGIFY&&console.log( "this:", this, "valueof:", this&&this.valueOf() );*/ 
	return this&&this.valueOf();
}

/**
 * Define a class to be used for serialization; the class allows emitting the class fields ahead of time, and just provide values later.
 * @param {string} name 
 * @param {object} obj 
 */
JSOX.defineClass = function( name, obj ) {
	let cls;
	let denormKeys = Object.keys(obj);
	for( let i = 1; i < denormKeys.length; i++ ) {
		let a, b;
		if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
			denormKeys[i-1] = b;
			denormKeys[i] = a;
			if( i ) i-=2; // go back 2, this might need to go further pack.
			else i--; // only 1 to check.
		}
	}
	//console.log( "normalized:", denormKeys );
	commonClasses.push( cls = { name : name
		   , tag:denormKeys.toString()
		   , proto : Object.getPrototypeOf(obj)
		   , fields : Object.keys(obj) } );
	for(let n = 1; n < cls.fields.length; n++) {
		if( cls.fields[n] < cls.fields[n-1] ) {
			let tmp = cls.fields[n-1];
			cls.fields[n-1] = cls.fields[n];
			cls.fields[n] = tmp;
			if( n > 1 )
				n-=2;
		}
	}
	if( cls.proto === Object.getPrototypeOf( {} ) ) cls.proto = null;
};

/**
 * define a class to be used for serialization
 * @param {string} named
 * @param {class} ptype
 * @param {(any)=>any} f
 */
JSOX.toJSOX =
JSOX.registerToJSOX = function( name, ptype, f ) {
	//console.log( "SET OBJECT TYPE:", ptype, ptype.prototype, Object.prototype, ptype.constructor );
	if( !ptype.prototype || ptype.prototype !== Object.prototype ) {
		if( toProtoTypes.get(ptype.prototype) ) throw new Error( "Existing toJSOX has been registered for prototype" );
		//_DEBUG_PARSING && console.log( "PUSH PROTOTYPE" );
		toProtoTypes.set( ptype.prototype, { external:true, name:name||f.constructor.name, cb:f } );
	} else {
		let key = Object.keys( ptype ).toString();
		if( toObjectTypes.get(key) ) throw new Error( "Existing toJSOX has been registered for object type" );
		//console.log( "TEST SET OBJECT TYPE:", key );
		toObjectTypes.set( key, { external:true, name:name, cb:f } );
	}
};
/**
 * define a class to be used for deserialization
 * @param {string} prototypeName 
 * @param {class} o 
 * @param {(any)=>any} f 
 */
JSOX.fromJSOX = function( prototypeName, o, f ) {
	function privateProto() { }
		if( !o ) o = privateProto.prototype;
		if( fromProtoTypes.get(prototypeName) ) throw new Error( "Existing fromJSOX has been registered for prototype" );
		if( o && !("constructor" in o )){
			throw new Error( "Please pass a prototype like thing...");
	}
	fromProtoTypes.set( prototypeName, {protoCon: o.prototype.constructor, cb:f } );

};
JSOX.registerFromJSOX = function( prototypeName, o /*, f*/ ) {
	throw new Error( "deprecated; please adjust code to use fromJSOX:" + prototypeName + o.toString() );
};
JSOX.addType = function( prototypeName, prototype, to, from ) {
	JSOX.toJSOX( prototypeName, prototype, to );
	JSOX.fromJSOX( prototypeName, prototype, from );
};

JSOX.registerToFrom = function( prototypeName, prototype/*, to, from*/ ) {
	throw new Error( "registerToFrom deprecated; please use addType:" + prototypeName + prototype.toString() );
};

/**
 * Create a stringifier to convert objects to JSOX text.  Allows defining custom serialization for objects.
 * @returns {Stringifier}
 */
JSOX.stringifier = function() {
	let classes = [];
	let useQuote = '"';

	let fieldMap = new WeakMap();
	const path = [];
	let encoding = [];
	const localToProtoTypes = new WeakMap();
	const localToObjectTypes = new Map();
	let objectToJSOX = null;
	const stringifying = []; // things that have been stringified through external toJSOX; allows second pass to skip this toJSOX pass and encode 'normally'
	let ignoreNonEnumerable = false;
	function getIdentifier(s) {
	
		if( ( "string" === typeof s ) && s === '' ) return '""';
		if( ( "number" === typeof s ) && !isNaN( s ) ) {
			return ["'",s.toString(),"'"].join('');
		}
		// should check also for if any non ident in string...
		if( s.includes( "\u{FEFF}" ) ) return (useQuote + JSOX.escape(s) +useQuote);
		return ( ( s in keywords /* [ "true","false","null","NaN","Infinity","undefined"].find( keyword=>keyword===s )*/
			|| /[0-9\-]/.test(s[0])
			|| /[\n\r\t \[\]{}()<>\~!+*/.:,\-"'`]/.test( s ) )?(useQuote + JSOX.escape(s) +useQuote):s )
	}


	/* init prototypes */
	if( !toProtoTypes.get( Object.prototype ) )
	{
		toProtoTypes.set( Object.prototype, { external:false, name:Object.prototype.constructor.name, cb:null } );
	   
		// function https://stackoverflow.com/a/17415677/4619267
		toProtoTypes.set( Date.prototype, { external:false,
			name : "Date",
			cb : function () {
					if( this.getTime()=== -62167219200000) 
					{
						return "0000-01-01T00:00:00.000Z";
					}
					let tzo = -this.getTimezoneOffset(),
					dif = tzo >= 0 ? '+' : '-',
					pad = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 10 ? '0' : '') + norm;
					},
					pad3 = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 100 ? '0' : '') + (norm < 10 ? '0' : '') + norm;
					};
				return [this.getFullYear() ,
					'-' , pad(this.getMonth() + 1) ,
					'-' , pad(this.getDate()) ,
					'T' , pad(this.getHours()) ,
					':' , pad(this.getMinutes()) ,
					':' , pad(this.getSeconds()) ,
					'.' + pad3(this.getMilliseconds()) +
					dif , pad(tzo / 60) ,
					':' , pad(tzo % 60)].join("");
			} 
		} );
		toProtoTypes.set( DateNS.prototype, { external:false,
			name : "DateNS",
			cb : function () {
				let tzo = -this.getTimezoneOffset(),
					dif = tzo >= 0 ? '+' : '-',
					pad = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 10 ? '0' : '') + norm;
					},
					pad3 = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 100 ? '0' : '') + (norm < 10 ? '0' : '') + norm;
					},
					pad6 = function(num) {
						let norm = Math.floor(Math.abs(num));
						return (norm < 100000 ? '0' : '') + (norm < 10000 ? '0' : '') + (norm < 1000 ? '0' : '') + (norm < 100 ? '0' : '') + (norm < 10 ? '0' : '') + norm;
					};
				return [this.getFullYear() ,
					'-' , pad(this.getMonth() + 1) ,
					'-' , pad(this.getDate()) ,
					'T' , pad(this.getHours()) ,
					':' , pad(this.getMinutes()) ,
					':' , pad(this.getSeconds()) ,
					'.' + pad3(this.getMilliseconds()) + pad6(this.ns) +
					dif , pad(tzo / 60) ,
					':' , pad(tzo % 60)].join("");
			} 
		} );
		toProtoTypes.set( Boolean.prototype, { external:false, name:"Boolean", cb:this_value  } );
		toProtoTypes.set( Number.prototype, { external:false, name:"Number"
		    , cb:function(){ 
				if( isNaN(this) )  return "NaN";
				return (isFinite(this))
					? String(this)
					: (this<0)?"-Infinity":"Infinity";
		    }
		} );
		toProtoTypes.set( String.prototype, { external:false
		    , name : "String"
		    , cb:function(){ return '"' + JSOX.escape(this_value.apply(this)) + '"' } } );
		if( typeof BigInt === "function" )
			toProtoTypes.set( BigInt.prototype
			     , { external:false, name:"BigInt", cb:function() { return this + 'n' } } );
	   
		toProtoTypes.set( ArrayBuffer.prototype, { external:true, name:"ab"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this))+"]" }
		} );
	   
		toProtoTypes.set( Uint8Array.prototype, { external:true, name:"u8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint8ClampedArray.prototype, { external:true, name:"uc8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int8Array.prototype, { external:true, name:"s8"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint16Array.prototype, { external:true, name:"u16"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int16Array.prototype, { external:true, name:"s16"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Uint32Array.prototype, { external:true, name:"u32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Int32Array.prototype, { external:true, name:"s32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		/*
		if( typeof Uint64Array != "undefined" )
			toProtoTypes.set( Uint64Array.prototype, { external:true, name:"u64"
			    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
			} );
		if( typeof Int64Array != "undefined" )
			toProtoTypes.set( Int64Array.prototype, { external:true, name:"s64"
			    , cb:function() { return "["+getIdentifier(base64ArrayBuffer(this.buffer))+"]" }
			} );
		*/
		toProtoTypes.set( Float32Array.prototype, { external:true, name:"f32"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Float64Array.prototype, { external:true, name:"f64"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
		toProtoTypes.set( Float64Array.prototype, { external:true, name:"f64"
		    , cb:function() { return "["+getIdentifier(base64ArrayBuffer$1(this.buffer))+"]" }
		} );
	   
		toProtoTypes.set( RegExp.prototype, mapToJSOX = { external:true, name:"regex"
		    , cb:function(o,stringifier){
				return "'"+escape(this.source)+"'";
			}
		} );
		fromProtoTypes.set( "regex", { protoCon:RegExp, cb:function (field,val){
			return new RegExp( this );
		} } );

		toProtoTypes.set( Map.prototype, mapToJSOX = { external:true, name:"map"
		    , cb:null
		} );
		fromProtoTypes.set( "map", { protoCon:Map, cb:function (field,val){
			if( field ) {
				this.set( field, val );
				return undefined;
			}
			return this;
		} } );
	   
		toProtoTypes.set( Array.prototype, arrayToJSOX = { external:false, name:Array.prototype.constructor.name
		    , cb: null		    
		} );

	}

	const stringifier = {
		defineClass(name,obj) { 
			let cls; 
			let denormKeys = Object.keys(obj);
			for( let i = 1; i < denormKeys.length; i++ ) {
				// normalize class key order
				let a, b;
				if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
					denormKeys[i-1] = b;
					denormKeys[i] = a;
					if( i ) i-=2; // go back 2, this might need to go further pack.
					else i--; // only 1 to check.
				}
			}
			classes.push( cls = { name : name
			       , tag:denormKeys.toString()
			       , proto : Object.getPrototypeOf(obj)
			       , fields : Object.keys(obj) } );

			for(let n = 1; n < cls.fields.length; n++) {
				if( cls.fields[n] < cls.fields[n-1] ) {
					let tmp = cls.fields[n-1];
					cls.fields[n-1] = cls.fields[n];
					cls.fields[n] = tmp;
					if( n > 1 )
						n-=2;
				}
			}
			if( cls.proto === Object.getPrototypeOf( {} ) ) cls.proto = null;
		},
		setDefaultObjectToJSOX( cb ) { objectToJSOX = cb; },
		isEncoding(o) {
			//console.log( "is object encoding?", encoding.length, o, encoding );
			return !!encoding.find( (eo,i)=>eo===o && i < (encoding.length-1) )
		},
		encodeObject(o) {
			if( objectToJSOX ) 
				return objectToJSOX.apply(o, [this]);
			return o;
		},
		stringify(o,r,s) { return stringify(o,r,s) },
		setQuote(q) { useQuote = q; },
		registerToJSOX(n,p,f) { return this.toJSOX( n,p,f ) },
		toJSOX( name, ptype, f ) {
			if( ptype.prototype && ptype.prototype !== Object.prototype ) {
				if( localToProtoTypes.get(ptype.prototype) ) throw new Error( "Existing toJSOX has been registered for prototype" );
				localToProtoTypes.set( ptype.prototype, { external:true, name:name||f.constructor.name, cb:f } );
			} else {
				let key = Object.keys( ptype ).toString();
				if( localToObjectTypes.get(key) ) throw new Error( "Existing toJSOX has been registered for object type" );
				localToObjectTypes.set( key, { external:true, name:name, cb:f } );
			}
		},
		get ignoreNonEnumerable() { return ignoreNonEnumerable; },
		set ignoreNonEnumerable(val) { ignoreNonEnumerable = val; },
	};
	return stringifier;

	/**
	 * get a reference to a previously seen object
	 * @param {any} here 
	 * @returns reference to existing object, or undefined if not found.
	 */
	function getReference( here ) {
		if( here === null ) return undefined;
		let field = fieldMap.get( here );
		//_DEBUG_STRINGIFY && console.log( "path:", _JSON.stringify(path), field );
		if( !field ) {
			fieldMap.set( here, _JSON.stringify(path) );
			return undefined;
		}
		return "ref"+field;
	}


	/**
	 * find the prototype definition for a class
	 * @param {object} o 
	 * @param {map} useK 
	 * @returns object
	 */
	function matchObject(o,useK) {
		let k;
		let cls;
		let prt = Object.getPrototypeOf(o);
		cls = classes.find( cls=>{
			if( cls.proto && cls.proto === prt ) return true;
		} );
		if( cls ) return cls;

		if( classes.length || commonClasses.length ) {
			if( useK )  {
				useK = useK.map( v=>{ if( typeof v === "string" ) return v; else return undefined; } );
				k = useK.toString();
			} else {
				let denormKeys = Object.keys(o);
				for( let i = 1; i < denormKeys.length; i++ ) {
					let a, b;
					if( ( a = denormKeys[i-1] ) > ( b = denormKeys[i] ) ) {
						denormKeys[i-1] = b;
						denormKeys[i] = a;
						if( i ) i-=2; // go back 2, this might need to go further pack.
						else i--; // only 1 to check.
					}
				}
				k = denormKeys.toString();
			}
			cls = classes.find( cls=>{
				if( cls.tag === k ) return true;
			} );
			if( !cls )
				cls = commonClasses.find( cls=>{
					if( cls.tag === k ) return true;
				} );
		}
		return cls;
	}

	/**
	 * Serialize an object to JSOX text.
	 * @param {any} object 
	 * @param {(key:string,value:any)=>string} replacer 
	 * @param {string|number} space 
	 * @returns 
	 */
	function stringify( object, replacer, space ) {
		if( object === undefined ) return "undefined";
		if( object === null ) return;
		let gap;
		let indent;
		let rep;

		let i;
		const spaceType = typeof space;
		const repType = typeof replacer;
		gap = "";
		indent = "";

		// If the space parameter is a number, make an indent string containing that
		// many spaces.

		if (spaceType === "number") {
			for (i = 0; i < space; i += 1) {
				indent += " ";
			}

		// If the space parameter is a string, it will be used as the indent string.
		} else if (spaceType === "string") {
			indent = space;
		}

		// If there is a replacer, it must be a function or an array.
		// Otherwise, throw an error.

		rep = replacer;
		if( replacer && repType !== "function"
		    && ( repType !== "object"
		       || typeof replacer.length !== "number"
		   )) {
			throw new Error("JSOX.stringify");
		}

		path.length = 0;
		fieldMap = new WeakMap();

		const finalResult = str( "", {"":object} );
		commonClasses.length = 0;
		return finalResult;

		// from https://github.com/douglascrockford/JSON-js/blob/master/json2.js#L181
		function str(key, holder) {
			var mind = gap;
			const doArrayToJSOX_ = arrayToJSOX.cb;
			const mapToObject_ = mapToJSOX.cb;		 
			arrayToJSOX.cb = doArrayToJSOX;
			mapToJSOX.cb = mapToObject;
			const v = str_(key,holder);
			arrayToJSOX.cb = doArrayToJSOX_;
			mapToJSOX.cb = mapToObject_;
			return v;

			function doArrayToJSOX() {
				let v;
				let partial = [];
				let thisNodeNameIndex = path.length;

				// The value is an array. Stringify every element. Use null as a placeholder
				// for non-JSOX values.
			
				for (let i = 0; i < this.length; i += 1) {
					path[thisNodeNameIndex] = i;
					partial[i] = str(i, this) || "null";
				}
				path.length = thisNodeNameIndex;
				//console.log( "remove encoding item", thisNodeNameIndex, encoding.length);
				encoding.length = thisNodeNameIndex;
			
				// Join all of the elements together, separated with commas, and wrap them in
				// brackets.
				v = ( partial.length === 0
					? "[]"
					: gap
						? [
							"[\n"
							, gap
							, partial.join(",\n" + gap)
							, "\n"
							, mind
							, "]"
						].join("")
						: "[" + partial.join(",") + "]" );
				return v;
			} 
			function mapToObject(){
				//_DEBUG_PARSING_DETAILS && console.log( "---------- NEW MAP -------------" );
				let tmp = {tmp:null};
				let out = '{';
				let first = true;
				//console.log( "CONVERT:", map);
				for (let [key, value] of this) {
					//console.log( "er...", key, value )
					tmp.tmp = value;
					let thisNodeNameIndex = path.length;
					path[thisNodeNameIndex] = key;
							
					out += (first?"":",") + getIdentifier(key) +':' + str("tmp", tmp);
					path.length = thisNodeNameIndex;
					first = false;
				}
				out += '}';
				//console.log( "out is:", out );
				return out;
			}

		// Produce a string from holder[key].
		function str_(key, holder) {

			let i;          // The loop counter.
			let k;          // The member key.
			let v;          // The member value.
			let length;
			let partialClass;
			let partial;
			let thisNodeNameIndex = path.length;
			let isValue = true;
			let value = holder[key];
			let isObject = (typeof value === "object");
			let c;

			if( isObject && ( value !== null ) ) {
				if( objectToJSOX ){
					if( !stringifying.find( val=>val===value ) ) {
						stringifying.push( value );
						encoding[thisNodeNameIndex] = value;
						isValue = false;
						value = objectToJSOX.apply(value, [stringifier]);
						//console.log( "Converted by object lookup -it's now a different type"
						//	, protoConverter, objectConverter );
						isObject = ( typeof value === "object" );
						stringifying.pop();
						encoding.length = thisNodeNameIndex;
						isObject = (typeof value === "object");
					}
					//console.log( "Value convereted to:", key, value );
				}
			}
			const objType = (value !== undefined && value !== null) && Object.getPrototypeOf( value );
			
			let protoConverter = objType
				&& ( localToProtoTypes.get( objType ) 
				|| toProtoTypes.get( objType ) 
				|| null );
			let objectConverter = !protoConverter && (value !== undefined && value !== null) 
				&& ( localToObjectTypes.get( Object.keys( value ).toString() ) 
				|| toObjectTypes.get( Object.keys( value ).toString() ) 
				|| null );

			// If we were called with a replacer function, then call the replacer to
			// obtain a replacement value.

			if (typeof rep === "function") {
				isValue = false;
				value = rep.call(holder, key, value);
			}
				//console.log( "PROTOTYPE:", Object.getPrototypeOf( value ) )
				//console.log( "PROTOTYPE:", toProtoTypes.get(Object.getPrototypeOf( value )) )
				//if( protoConverter )
			//_DEBUG_STRINGIFY && console.log( "TEST()", value, protoConverter, objectConverter );

			let toJSOX = ( protoConverter && protoConverter.cb ) 
			          || ( objectConverter && objectConverter.cb );
			// If the value has a toJSOX method, call it to obtain a replacement value.
			//_DEBUG_STRINGIFY && console.log( "type:", typeof value, protoConverter, !!toJSOX, path );

			if( value !== undefined
			    && value !== null
				&& typeof value === "object"
			    && typeof toJSOX === "function"
			) {
				if( !stringifying.find( val=>val===value ) ) {
					if( typeof value === "object" ) {
						v = getReference( value );
						if( v )	return v;
					}

					stringifying.push( value );
					encoding[thisNodeNameIndex] = value;
					value = toJSOX.call(value, stringifier);
					isValue = false;
					stringifying.pop();
					if( protoConverter && protoConverter.name ) {
						// stringify may return a unquoted string
						// which needs an extra space betwen its tag and value.
						if( "string" === typeof value 
							&& value[0] !== '-'
							&& (value[0] < '0' || value[0] > '9' )
							&& value[0] !== '"'
							&& value[0] !== '\'' 
							&& value[0] !== '`' 
							&& value[0] !== '[' 
							&& value[0] !== '{' 
							){
							value = ' ' + value;
						}
					}
					//console.log( "Value converted:", value );
					encoding.length = thisNodeNameIndex;
				} else {
					v = getReference( value );
				}
		} else 
				if( typeof value === "object" ) {
					v = getReference( value );
					if( v ) return v;
				}

			// What happens next depends on the value's type.
			switch (typeof value) {
			case "bigint":
				return value + 'n';
			case "string":
				{
					//console.log( `Value was converted before?  [${value}]`);
					value = isValue?getIdentifier(value):value;
					let c = '';
					if( key==="" )
						c = classes.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")+
						    commonClasses.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")
								+(gap?"\n":"");
					if( protoConverter && protoConverter.external ) 
						return c + protoConverter.name + value;
					if( objectConverter && objectConverter.external ) 
						return c + objectConverter.name + value;
					return c + value;//useQuote+JSOX.escape( value )+useQuote;
				}
			case "number":
			case "boolean":
			case "null":

				// If the value is a boolean or null, convert it to a string. Note:
				// typeof null does not produce "null". The case is included here in
				// the remote chance that this gets fixed someday.

				return String(value);

				// If the type is "object", we might be dealing with an object or an array or
				// null.

			case "object":
				//_DEBUG_STRINGIFY && console.log( "ENTERINT OBJECT EMISSION WITH:", v );
				if( v ) return "ref"+v;

				// Due to a specification blunder in ECMAScript, typeof null is "object",
				// so watch out for that case.
				if (!value) {
					return "null";
				}

				// Make an array to hold the partial results of stringifying this object value.
				gap += indent;
				partialClass = null;
				partial = [];

				// If the replacer is an array, use it to select the members to be stringified.
				if (rep && typeof rep === "object") {
					length = rep.length;
					partialClass = matchObject( value, rep );
					for (i = 0; i < length; i += 1) {
						if (typeof rep[i] === "string") {
							k = rep[i];
							path[thisNodeNameIndex] = k;
							v = str(k, value);

							if (v !== undefined ) {
								if( partialClass ) {
									partial.push(v);
								} else
									partial.push( getIdentifier(k) 
									+ (
										(gap)
											? ": "
											: ":"
									) + v);
							}
						}
					}
					path.splice( thisNodeNameIndex, 1 );
				} else {

					// Otherwise, iterate through all of the keys in the object.
					partialClass = matchObject( value );
					let keys = [];
					for (k in value) {
						if( ignoreNonEnumerable )
							if( !Object.prototype.propertyIsEnumerable.call( value, k ) ){
								//_DEBUG_STRINGIFY && console.log( "skipping non-enuerable?", k );
								continue;
							}
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							let n;
							for( n = 0; n < keys.length; n++ ) 
								if( keys[n] > k ) {	
									keys.splice(n,0,k );
									break;
								}
							if( n == keys.length )
								keys.push(k);
						}
					}
					for(let n = 0; n < keys.length; n++) {
						k = keys[n];
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							path[thisNodeNameIndex] = k;
							v = str(k, value);

							if (v !== undefined ) {
								if( partialClass ) {
									partial.push(v);
								} else
									partial.push(getIdentifier(k) + (
										(gap)
											? ": "
											: ":"
									) + v);
							}
						}
					}
					path.splice( thisNodeNameIndex, 1 );
				}

				// Join all of the member texts together, separated with commas,
				// and wrap them in braces.
				//_DEBUG_STRINGIFY && console.log( "partial:", partial )

				//let c;
				if( key==="" )
					c = ( classes.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":"")
						|| commonClasses.map( cls=> cls.name+"{"+cls.fields.join(",")+"}" ).join(gap?"\n":""))+(gap?"\n":"");
				else
					c = '';

				if( protoConverter && protoConverter.external ) 
					c = c + getIdentifier(protoConverter.name);

				//_DEBUG_STRINGIFY && console.log( "PREFIX FOR THIS FIELD:", c );
				let ident = null;
				if( partialClass )
					ident = getIdentifier( partialClass.name ) ;
				v = c +
					( partial.length === 0
					? "{}"
					: gap
							? (partialClass?ident:"")+"{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
							: (partialClass?ident:"")+"{" + partial.join(",") + "}"
					);

				gap = mind;
				return v;
			}
		}
	}

	}
};

	// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
	// use window.btoa' step. According to my tests, this appears to be a faster approach:
	// http://jsperf.com/encoding-xhr-image-data/5
	// doesn't have to be reversable....
	const encodings$1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';
	const decodings$1 = { '~':-1
		,'=':-1
		,'$':62
		,'_':63
		,'+':62
		,'-':62
		,'.':62
		,'/':63
		,',':63
	};
	
	for( let x = 0; x < encodings$1.length; x++ ) {
		decodings$1[encodings$1[x]] = x;
	}
	Object.freeze( decodings$1 );
	
	function base64ArrayBuffer$1(arrayBuffer) {
		let base64    = '';
	
		let bytes         = new Uint8Array(arrayBuffer);
		let byteLength    = bytes.byteLength;
		let byteRemainder = byteLength % 3;
		let mainLength    = byteLength - byteRemainder;
	
		let a, b, c, d;
		let chunk;
		//throw "who's using this?"
		//console.log( "buffer..", arrayBuffer )
		// Main loop deals with bytes in chunks of 3
		for (let i = 0; i < mainLength; i = i + 3) {
			// Combine the three bytes into a single integer
			chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

			// Use bitmasks to extract 6-bit segments from the triplet
			a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
			b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
			c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
			d = chunk & 63;               // 63       = 2^6 - 1
	
			// Convert the raw binary segments to the appropriate ASCII encoding
			base64 += encodings$1[a] + encodings$1[b] + encodings$1[c] + encodings$1[d];
		}
	
	// Deal with the remaining bytes and padding
		if (byteRemainder == 1) {
			chunk = bytes[mainLength];
			a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
			// Set the 4 least significant bits to zero
			b = (chunk & 3)   << 4; // 3   = 2^2 - 1
			base64 += encodings$1[a] + encodings$1[b] + '==';
		} else if (byteRemainder == 2) {
			chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
			a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
			b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4
			// Set the 2 least significant bits to zero
			c = (chunk & 15)    <<  2; // 15    = 2^4 - 1
			base64 += encodings$1[a] + encodings$1[b] + encodings$1[c] + '=';
		}
		//console.log( "dup?", base64)
		return base64
	}
	
	
	function DecodeBase64( buf ) {	
		let outsize;
		if( buf.length % 4 == 1 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 3;
		else if( buf.length % 4 == 2 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 2;
		else if( buf.length % 4 == 3 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 1;
		else if( decodings$1[buf[buf.length - 3]] == -1 )
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 3;
		else if( decodings$1[buf[buf.length - 2]] == -1 ) 
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 2;
		else if( decodings$1[buf[buf.length - 1]] == -1 ) 
			outsize = ((((buf.length + 3) / 4)|0) * 3) - 1;
		else
			outsize = ((((buf.length + 3) / 4)|0) * 3);
		let ab = new ArrayBuffer( outsize );
		let out = new Uint8Array(ab);

		let n;
		let l = (buf.length+3)>>2;
		for( n = 0; n < l; n++ ) {
			let index0 = decodings$1[buf[n*4]];
			let index1 = (n*4+1)<buf.length?decodings$1[buf[n*4+1]]:-1;
			let index2 = (index1>=0) && (n*4+2)<buf.length?decodings$1[buf[n*4+2]]:-1;
			let index3 = (index2>=0) && (n*4+3)<buf.length?decodings$1[buf[n*4+3]]:-1;
			if( index1 >= 0 )
				out[n*3+0] = (( index0 ) << 2 | ( index1 ) >> 4);
			if( index2 >= 0 )
				out[n*3+1] = (( index1 ) << 4 | ( ( ( index2 ) >> 2 ) & 0x0f ));
			if( index3 >= 0 )
				out[n*3+2] = (( index2 ) << 6 | ( ( index3 ) & 0x3F ));
		}

		return ab;
	}
	
/**
 * @param {unknown} object 
 * @param {(this: unknown, key: string, value: unknown)} [replacer] 
 * @param {string | number} [space] 
 * @returns {string}
 */	
JSOX.stringify = function( object, replacer, space ) {
	let stringifier = JSOX.stringifier();
	return stringifier.stringify( object, replacer, space );
};

[ [ 0,256,[ 0xffd9ff,0xff6aff,0x1fc00,0x380000,0x0,0xfffff8,0xffffff,0x7fffff] ]
].map( row=>{ return { firstChar : row[0], lastChar: row[1], bits : row[2] }; } );

// usage
//  var RNG = require( "salty_random_generator")( callback }
//    constructor callback is used as a source of salt to the generator
//    the callback is passed an array to which strings are expected to be added
//     ( [] )=>{ [].push( more_salt ); }
//
//    - methods on RNG
//         reset()
//                clear current random state, and restart
//
//         getBits( /* 0-31 */ )
//                return a Number that is that many bits from the random stream
//
//         getBuffer( /* 0-n */ )
//                returns a ArrayBuffer that is that many bits of randomness...
//
//         save()
//                return an object representing the current RNG state
//
//         restore( o )
//                use object to restore RNG state.
//
//          feed( buf )
//                feed a raw uint8array.
//


//var exports = exports || {};

	// My JS Encoding $_ and = at the end.  allows most to be identifiers too.
	// 'standard' encoding + /
	// variants            - /
	//                     + ,
	//                     . _
	// variants            - _


const encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';
const decodings = { '~':0
		,'=':0
		,'$':62
		,'_':63
		,'+':62
		,'-':62
		,'.':62
		,'/':63
		,',':63
};
const u8xor_code_encodings2 = new Uint8Array( 64* 128 );

for( var x = 0; x < 256; x++ ) {
	if( x < 64 ) {
		decodings[encodings[x]] = x;
	}
}

//const u8xor_code_encodings2 = new Uint8Array( 64* 128 );

for( let a = 0; a < 64; a++  ) {
   for( let b = 0; b < encodings.length; b++  ) {
     u8xor_code_encodings2[(a<<7)+encodings.codePointAt(b)] = a^b;
   }
}

Object.freeze( decodings );
//Object.freeze( u8xor_code_encodings2 );


function SaltyRNG(f, opt) {

	const readBufs = [];
	const K12_SQUEEZE_LENGTH = 32768;

	const k12buf2 = KangarooTwelveJS();

	function MASK_TOP_MASK(length) {
		return (0xFF) >>> (8 - (length))
	}
	function MY_MASK_MASK(n, length) {
		return (MASK_TOP_MASK(length) << ((n) & 0x7)) & 0xFF;
	}
	function MY_GET_MASK(v, n, mask_size) {
		return (v[(n) >> 3] & MY_MASK_MASK(n, mask_size)) >>> (((n)) & 0x7)
	}

	function compute(buf) {
		k12buf2.update(buf);		
		k12buf2.final();
		return k12buf2.squeeze( K12_SQUEEZE_LENGTH>>3 );
	}
	var RNG = {
		getSalt: f,
		feed(buf) {
			//if( typeof buf === "string" )
			//	buf = toUTF8Array( buf );
			k12buf2.update(buf);
		},
		saltbuf: [],
		entropy: null,
		available: 0,
		used: 0,
		total_bits : 0,
		initialEntropy : null,//"test",
		save() {
			return {
				saltbuf: this.saltbuf.slice(0),
				entropy: this.entropy?this.entropy.slice(0):null,
				available: this.available,
				used: this.used,
				state : k12buf2.clone()
			}
		},
		restore(oldState) {
			this.saltbuf = oldState.saltbuf.slice(0);
			this.entropy = oldState.entropy?oldState.entropy.slice(0):null;
			this.available = oldState.available;
			this.used = oldState.used;
			//throw new Error( "RESTORE STATE IS BROKEN." );
			k12buf2 && k12buf2.copy( oldState.state );
		},
		reset() {
			this.entropy = 
				this.initialEntropy
					?compute(this.initialEntropy)
					:null;
			this.available = 0;
			this.used = 0;
			this.total_bits = 0;
			k12buf2.init();
		},
		getByte() {
			if( this.used & 0x7 ) {
				const buf = this.getBuffer_(8).u8;
				const val = buf[0];
				readBufs[8].push( buf );
				return val;
		
			} else {
				if(this.available === this.used)
					needBits();
				this.total_bits += 8;
				var result = this.entropy[(this.used) >> 3];
				this.used += 8;
				return result;
			}
		},
		getBits(count, signed) {
			if( !count ) { count = 32; signed = true; } 
			if (count > 32)
				throw "Use getBuffer for more than 32 bits.";
			var tmp = this.getBuffer_(count);
			if( !tmp.u32 ) tmp.u32 = new Uint32Array(tmp.ab);
			var val = tmp.u32[0];
			if( signed ) {
				if(  val & ( 1 << (count-1) ) ) { // sign extend
					var negone = ~0;
					negone <<= (count-1);
					val |= negone;
				}
			}
			readBufs[count].push( tmp );
			return val;
		},
		getBuffer(bits) {
			return this.getBuffer_(bits).u8;
		},
		getBuffer_(bits) {
			let resultIndex = 0;
			let resultBits = 0;
			if( readBufs.length <= bits ) { for( let zz = readBufs.length; zz <= bits; zz++ ) readBufs.push([]); }
			let resultBuffer = readBufs[bits].length?readBufs[bits].pop():{ab:new ArrayBuffer(4 * ((bits + 31) >> 5)),u8:null,u32:null};
			let result = resultBuffer.u8?resultBuffer.u8:(resultBuffer.u8 = new Uint8Array(resultBuffer.ab) );
			//result.ab = resultBuffer.ab;
			for( let zz = 0; zz < result.length; zz++ ) result[zz] = 0;
			this.total_bits += bits;
			{
				let tmp;
				let partial_tmp;
				let partial_bits = 0;
				let get_bits;

				do {
					if (bits > 8)
						get_bits = 8;
					else
						get_bits = bits;
					// if there were 1-7 bits of data in partial, then can only get 8-partial max.
					if( (8-partial_bits) < get_bits )
						get_bits = (8-partial_bits);
					// if get_bits == 8
					//    but bits_used is 1-7, then it would have to pull 2 bytes to get the 8 required
					//    so truncate get_bits to 1-7 bits
					let chunk = ( 8 - ( this.used & 7) );
					if( chunk < get_bits )
						get_bits = chunk;
					// if resultBits is 1-7 offset, then would have to store up to 2 bytes of value
					//    so have to truncate to just the up to 1 bytes that will fit.
					chunk = ( 8 - ( resultBits & 7) );
					if( chunk < get_bits )
						get_bits = chunk;

					//console.log( "Get bits:", get_bits, " after", this.used, "into", resultBits );
					// only greater... if equal just grab the bits.
					if (get_bits > (this.available - this.used)) {
						if (this.available - this.used) {
							partial_bits = this.available - this.used;
							// partial can never be greater than 8; request is never greater than 8
							//if (partial_bits > 8)
							//	partial_bits = 8;
							partial_tmp = MY_GET_MASK(this.entropy, this.used, partial_bits);
						}
						needBits();
						bits -= partial_bits;
					}
					else {
						tmp = MY_GET_MASK(this.entropy, this.used, get_bits);
						this.used += get_bits;
						if (partial_bits) {
							tmp = partial_tmp | (tmp << partial_bits);
							partial_bits = 0;
						}
						
						result[resultIndex] |= tmp << (resultBits&7);
						resultBits += get_bits;
						// because of input limits, total result bits can only be 8 or less.
						if( resultBits == 8 ) {
							resultIndex++;
							resultBits = 0;
						}
						bits -= get_bits;
					}
				} while (bits);
				//console.log( "output is ", result[0].toString(16), result[1].toString(16), result[2].toString(16), result[3].toString(16) )
				return resultBuffer;
			}
		}
	};
	function needBits() {
		RNG.saltbuf.length = 0;
			if (typeof (RNG.getSalt) === 'function') {
				RNG.getSalt(RNG.saltbuf);
                        	if( RNG.entropy ) {
					k12buf2.init();
					k12buf2.update( RNG.entropy.slice( 0, 200 ) );
                                }
				if( RNG.saltbuf.length ) {
					k12buf2.update( RNG.saltbuf );
				}
			}

		if( k12buf2.squeezing() ) {
			RNG.entropy = k12buf2.squeeze(K12_SQUEEZE_LENGTH>>3); // customization is a final pad string.
		}else console.log( "Not squeezing so all is bad?" );
		RNG.available = RNG.entropy.length * 8;
		RNG.used = 0;
	}	
	RNG.reset();
	return RNG;
}


//import {  keccakprg } from './standalone/sha3-addons.js';

/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
/*! Salty Random Generator - Extracted KeccakPRG and support functions from at least 1.0 tag 
  - d3x0r
*/

const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
// There is almost no big endian hardware, but js typed arrays uses platform specific endianess.
// So, just to be sure not to corrupt anything.
if (!isLE)
    throw new Error('Non little-endian hardware is not supported');
/**
 * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string') {
        throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
    }
    return new TextEncoder().encode(str);
}

function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    if (!(data instanceof Uint8Array))
        throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
    return data;
}
const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
//import { toBytes, wrapConstructorWithOpts, assertNumber, u32, } from './utils.js';


class Hash {
    // Safe version that clones internal state
}



// import * as u64 from './_u64.js';

const [SHA3_PI, SHA3_ROTL, _SHA3_IOTA] = [[], [], []];
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _7n = BigInt(7);
const _256n = BigInt(256);
const _0x71n = BigInt(0x71);
const security = 128;
const capacity = (2*security);

for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}

const SHA3_IOTA_H = new Uint32Array(_SHA3_IOTA.length);
const SHA3_IOTA_L = new Uint32Array(_SHA3_IOTA.length); 
for (let i = 0; i < _SHA3_IOTA.length; i++) {
		SHA3_IOTA_H[i] = Number((_SHA3_IOTA[i]) & (2n ** 32n - 1n));
		SHA3_IOTA_L[i] = Number(((_SHA3_IOTA[i]) >> 32n) & (2n ** 32n - 1n));
}


function rightEncodeK12(n) {
    const res = [];
    for (; n > 0; n >>= 8)
        res.unshift(n & 0xff);
    res.push(res.length);
    return new Uint8Array(res);
}

class Keccak extends Hash {
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 12) {
        super();
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        if (0 >= this.blockLen || this.blockLen >= 200)
            throw new Error('Sha3 supports only keccak-f1600 function');
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
    }
    keccak() {
        //keccakP(this.state32, this.rounds); 
        const s = this.state32;
        const rounds = this.rounds;
        const B = new Uint32Array(5 * 2);
        // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
        for (let round = 24 - rounds; round < 24; round++) {
            // Theta θ
            for (let x = 0; x < 10; x++)
                B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
            for (let x = 0; x < 10; x += 2) {
                const idx1 = (x + 8) % 10;
                const idx0 = (x + 2) % 10;
                const B0 = B[idx0];
                const B1 = B[idx0 + 1];  
                const Th = ((B0 << 1) | (B1 >>> (31)))^ B[idx1];     //  u64.rotlSH(B0, B1, 1)^ B[idx1];    // rotlH(B0, B1, 1) ^ B[idx1];
                const Tl = ((B1 << 1) | (B0 >>> (31)))^ B[idx1 + 1]; // u64.rotlSL(B0, B1, 1)^ B[idx1 + 1];// rotlL(B0, B1, 1) ^ B[idx1 + 1];
                for (let y = 0; y < 50; y += 10) {
                    s[x + y] ^= Th;
                    s[x + y + 1] ^= Tl;
                }
            }
            // Rho (ρ) and Pi (π)
            let curH = s[2];
            let curL = s[3];
            for (let t = 0; t < 24; t++) {
                const shift = SHA3_ROTL[t];
                const Th = shift > 32 ? ((curL << (shift - 32)) | (curH >>> (64 - shift))) : ((curH << shift) | (curL >>> (32 - shift))); //   rotlH(curH, curL, shift);
                const Tl = shift > 32 ? ((curH << (shift - 32)) | (curL >>> (64 - shift))) : ((curL << shift) | (curH >>> (32 - shift))); //   u64.rotlBL(curH, curL, shift) : u64.rotlSL(curH, curL, shift)  ;//rotlL(curH, curL, shift);
                const PI = SHA3_PI[t];
                curH = s[PI];
                curL = s[PI + 1];
                s[PI] = Th;
                s[PI + 1] = Tl;
            }
            // Chi (χ)
            for (let y = 0; y < 50; y += 10) {
                for (let x = 0; x < 10; x++)
                    B[x] = s[y + x];
                for (let x = 0; x < 10; x++)
                    s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
            }
            // Iota (ι)
            s[0] ^= SHA3_IOTA_H[round];
            s[1] ^= SHA3_IOTA_L[round];
        }
        //B.fill(0);


        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        const { blockLen, state } = this;
        data = toBytes(data);
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen) {
                this.keccak();
				}
        }
        return this;
    }
    finish() {
        if (this.finished) {
				console.log( "is already finished??" );
            return;
			}
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen) {
                this.keccak();
				}
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        this.state.fill(0);
    }
}

const toBytesOptional = (buf) => (buf !== undefined ? (toBytes)(buf) : new Uint8Array([]));

class KangarooTwelve extends Keccak {
    constructor(blockLen, leafLen, outputLen, rounds, opts) {
        super(blockLen, 0x07, outputLen, true, rounds);
        this.leafLen = leafLen;
        this.chunkLen = 8192;
        this.chunkPos = 0; // Position of current block in chunk
        this.chunksDone = 0; // How many chunks we already have
        const { personalization } = opts;
        this.personalization = toBytesOptional(personalization);
    }
    update(data) {
        data = (toBytes)(data);
        const { chunkLen, blockLen, leafLen, rounds } = this;
        for (let pos = 0, len = data.length; pos < len;) {
            if (this.chunkPos == chunkLen) {
                if (this.leafHash)
                    super.update(this.leafHash.digest());
                else {
                    this.suffix = 0x06; // Its safe to change suffix here since its used only in digest()
                    super.update(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]));
                }
                this.leafHash = new Keccak(blockLen, 0x0b, leafLen, false, rounds);
                this.chunksDone++;
                this.chunkPos = 0;
            }
            const take = Math.min(chunkLen - this.chunkPos, len - pos);
            const chunk = data.subarray(pos, pos + take);
            if (this.leafHash)
                this.leafHash.update(chunk);
            else
                super.update(chunk);
            this.chunkPos += take;
            pos += take;
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        const { personalization } = this;
        this.update(personalization).update(rightEncodeK12(personalization.length));
        // Leaf hash
        if (this.leafHash) {
            super.update(this.leafHash.digest());
            super.update(rightEncodeK12(this.chunksDone));
            super.update(new Uint8Array([0xff, 0xff]));
        }
        super.finish.call(this);
    }
    destroy() {
        super.destroy.call(this);
        if (this.leafHash)
            this.leafHash.destroy();
        // We cannot zero personalization buffer since it is user provided and we don't want to mutate user input
        this.personalization = EMPTY;
    }
}



function KangarooTwelveJS() {
	const data = {
		k : 0,
		keybuf : 0,
		keybuflen : 0,
		buf : 0,
		bufMaps : new WeakMap(),
		outbuf : 0,
		realBuf : null,
	};
	let phase = 1;
	data.k = new KangarooTwelve((1600-capacity) / 8, 0, 0, 12, {});
	var K12 = {
		init() {
			//data.k.forget()
			data.k = new KangarooTwelve((1600-capacity) / 8, 0, 0, 12, {});			
		},
		drop() {
			data.keybuf = null;
			data.buf = null;
			data.k = null;
			//console.log( "S?", s );
		},
		update(buf) {
			phase = 2;
			if( buf instanceof Array ) {
				if( "number" === typeof buf[0] ) {
					//buf = buf.join();
					//console.log( "xxBuf join?", buf );
					const byteLength = buf.length;
					const newbuf = new Uint8Array(byteLength );
					for( let n = 0; n < buf.length; n++ ) newbuf[n]=buf[n];
					buf = newbuf;
					//console.log( "yay?", byteLength, buf );
				} else {
					buf = buf.join();
					//console.log( "Buf join?", buf );
				}
			} 
			data.k.update( buf );
		},
		final() {
			//data.k.final();
		},
		squeeze(n) {			
			return data.k.xof(n);//data.k.fetch( n );
		},
		release(buf) {
		},
		absorbing() {
			if( phase === 1 ) return true;
			return false;
		},
		squeezing() {
			if( phase === 2 ) return true;
			return false;				
		},
		clone() {
                    console.log( "clone not implemented?" );
		},
		copy(from) {
                    console.log( "copy not implemented?" );
		},
		phase() {
			return phase;
		},
	};
	
	//data.k = k12._NewKangarooTwelve();
	//data.outbuf = k12._malloc( 64 );
	//console.log( "malloc:", data.outbuf );
	//data.realBuf = k12.HEAPU8.slice( data.outbuf, data.outbuf+64 );
	//data.realBuf = new Uint8Array( k12.HEAPU8.buffer, data.outbuf, 64 );
	//K12.absorbing = k12._KangarooTwelve_IsAbsorbing.bind(k12,data.k),
	//K12.squeezing = k12._KangarooTwelve_IsSqueezing.bind(k12,data.k),

	K12.init();

	return K12;
}



const seeds = [];
function shuffleSeeder(salt){
  var val;
  if( seeds.length ) {
    //console.log( "using seed... ", seeds.length )
    salt.push( seeds.shift() );
  } else {
    salt.push(  ( val = new Date().getTime(), val =( val % 100000 ) * ( val % 100000 ) )  );
    // save seeds to rebuild stream later is possible...
    //if( outSeeds )
    //  outSeeds.write( String(val) + "\n");
  }
}

function Holder() {
  return {
    number : 0
    , r : 0
    , less : null
    , more : null
  };
}
var holders = [];

function sort(  tree,  number,  r )
{
    //console.log( "Assign ", r, " to ", number)
   if( !tree )
   {
      tree = holders.pop();
      if( !tree ) tree = Holder();
      tree.number = number;
      tree.r = r;
      tree.pLess = tree.pMore = null;
   }
   else
   {
      if( r > tree.r )
         tree.pMore = sort( tree.pMore, number, r );
      else
         tree.pLess = sort( tree.pLess, number, r );
   }
   return tree;
}
function  FoldTree( tree, numbers, count )
{
   if( !(count-numbers.length) ) return numbers;
   if( tree.pLess )
      FoldTree( tree.pLess, numbers, count );
   numbers.push(tree.number);
   holders.push(tree);
   if( tree.pMore )
      FoldTree( tree.pMore, numbers, count ); 
   return numbers
}

function  Shuffle( numbers, count, RNG )
{
	const bits = (Math.ceil(Math.log2( numbers.length ))+2 )|0;
	var tree;
	var n;
	tree = null;
	for( n of numbers )
		tree = sort( tree, n, RNG.getBits(bits) );//RNG.getBits( 13 ) );

	var x = FoldTree( tree, [], count||numbers.length );
	
	return x;
}

function Shuffler( opts ) {
	var RNG;
	if( opts && opts.salt ) {
		RNG = SaltyRNG( opts.salt);
	}
	else 
		RNG = SaltyRNG( shuffleSeeder);
	return {
		shuffle(numbers,count) {
			 return Shuffle(numbers,count, RNG);
		}
	};
}

SaltyRNG.Shuffler = Shuffler;

//----------------------------------------------------------------------------

const RNG= SaltyRNG( 
	(saltbuf)=>saltbuf.push( new Date().toISOString() ));
const RNG2 = SaltyRNG( getSalt2);
RNG2.initialEntropy = null;


let salt = null;
function getSalt2 (saltbuf) {
    if( salt ) {
        saltbuf.push( salt );
        salt = null;
    }
}

SaltyRNG.id = function( s ) {
	if( s !== undefined ) {
		salt = s;
		RNG2.reset();
		//RNG2.feed( "\0\0\0\0");
		//RNG2.feed( s );
		// this is an ipv6 + UUID
		return base64ArrayBuffer( RNG2.getBuffer(8*(16+16)) );
	}
   	return base64ArrayBuffer( RNG.getBuffer(8*(16+16)) );
};

SaltyRNG.Id = function(s) {
    // this is an ipv6 + UUID
    let ID;
	if( s !== undefined ) {
		salt = s;
		RNG2.reset();
		// this is an ipv6 + UUID
		ID = RNG2.getBuffer(8*(12));
	}
	else {
    		ID = RNG.getBuffer(8*(12));
                // 1 second marker
	    const now = ( Date.now() / 1000 ) | 0;
	    ID[0] = ( now & 0xFF0000 ) >> 16;
	    ID[1] = ( now & 0x00FF00 ) >> 8;
	    ID[2] = ( now & 0x0000FF );
	}
    return base64ArrayBuffer( ID );
};

SaltyRNG.u16_id = function() {
    // this is an ipv6 + UUID
    var out = [];
    for( var c = 0; c < 25; c++ ) {
    	var ch = RNG.getBits( 10 ); if( ch < 32 ) ch |= 64;
    	out[c] = String.fromCodePoint( ch );
    }
    return out.join('');
};

function signCheck( buf ) {
		buf = new Uint8Array(buf);
		var n, b;
		var is0 = 0;
		var is1 = 0;
		var long0 = 0;
		var long1 = 0;
		var longest0 = 0;
		var longest1 = 0;
		var ones = 0;
		for( n = 0; n < 32; n++ ) {
			for( b = 0; b < 8; b++ ) {
				if( buf[n] & (1 << b) ) {
					ones++;
					if( is1 ) {
						long1++;
					}
					else {
						if( long0 > longest0 ) longest0 = long0;
						is1 = 1;
						is0 = 0;
						long1 = 1;
					}
				}
				else {
					if( is0 ) {
						long0++;
					}
					else {
						if( long1 > longest1 ) longest1 = long1;
						is0 = 1;
						is1 = 0;
						long0 = 1;
					}
				}
			}
		}
// 167-128 = 39 = 40+ dif == 30 bits in a row approx
//const overbal = (167-128)
		const overbal = (167-128);
                    //console.log( "result:", overbal, longest0, longest1, ones );
		if( longest0 > 29 || longest1 > 29 || ones > (128+overbal) || ones < (128-overbal) ) {
			return 1;
		}
		return 0;
	}

let signEntropy;
let nextSalt = new Uint8Array(32);
SaltyRNG.sign = function( msg ) {

		//SRGObject *obj = ObjectWrap::Unwrap<SRGObject>( args.This() );
		var id;
		//memcpy( nextSalt, *buf, buf.length() );
		if( !signEntropy ) {
			signEntropy = SaltyRNG( null);
			signEntropy.initialEntropy = null;
		}

		do {
			signEntropy.reset();
			//console.log( "Feed message", msg );
			signEntropy.feed( msg );

			{
				id = SaltyRNG.id();
				DecodeBase64Into( nextSalt, id );
				signEntropy.feed( nextSalt );
				var bytes = signEntropy.getBuffer( 256 );
				if( signCheck( bytes ) ) ; else {
					id = null;
				}
			}
		} while( !id );
		return id;
		
};

SaltyRNG.verify = function( msg, id  ) {
		if( !signEntropy ) {
			signEntropy = SaltyRNG( null);
			signEntropy.initialEntropy = null;
		}
		signEntropy.reset();
		//console.log( "Feed message.", msg );
		signEntropy.feed( msg );
		DecodeBase64Into( nextSalt, id );
		//console.log( "Feed ID", nextSalt, id );
		signEntropy.feed( nextSalt );
		var bytes = signEntropy.getBuffer( 256 );
		//console.log( "bytes:", new Uint8Array( bytes ) );
		return signCheck( bytes );
};


function base64ArrayBuffer(arrayBuffer) {
  var base64    = '';

  var bytes         = new Uint8Array(arrayBuffer);
  var byteLength    = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength    = byteLength - byteRemainder;

  var a, b, c, d;
  var chunk;
  //throw "who's using this?"
  //console.log( "buffer..", arrayBuffer )
  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63;               // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];
    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
    // Set the 4 least significant bits to zero
    b = (chunk & 3)   << 4; // 3   = 2^2 - 1
    base64 += encodings[a] + encodings[b] + '==';
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4
    // Set the 2 least significant bits to zero
    c = (chunk & 15)    <<  2; // 15    = 2^4 - 1
    base64 += encodings[a] + encodings[b] + encodings[c] + '=';
  }
  //console.log( "dup?", base64)
  return base64
}


function DecodeBase64Into( out, buf ) {
	var outsize = 0;
	// if the buffer is truncated in length, use that as the 
	// constraint, and if 1 char results with 6 bits, do not
	// count that as a whole byte of output.
        if( !out ) {
		if( buf.length % 4 == 1 )
			outsize = (((buf.length + 3) / 4) * 3) - 3;
		else if( buf.length % 4 == 2 )
			outsize = (((buf.length + 3) / 4) * 3) - 2;
		else if( buf.length % 4 == 3 )
			outsize = (((buf.length + 3) / 4) * 3) - 1;
		else if( buf[buf.length - 1] == '=' ) {
			if( buf[buf.length - 2] == '=' )
				outsize = (((buf.length + 3) / 4) * 3) - 2;
			else
				outsize = (((buf.length + 3) / 4) * 3) - 1;
		}
		else
			outsize = (((buf.length + 3) / 4) * 3);
		out = new Uint8Array( outsize );
	}

	var n;
	var l = (buf.length+3)/4;
	for( n = 0; n < l; n++ )
	{
		var index0 = decodings[buf[n*4]];
		var index1 = decodings[buf[n*4+1]];
		var index2 = decodings[buf[n*4+2]];
		var index3 = decodings[buf[n*4+3]];
		
		out[n*3+0] = (( index0 ) << 2 | ( index1 ) >> 4);
		out[n*3+1] = (( index1 ) << 4 | ( ( ( index2 ) >> 2 ) & 0x0f ));
		out[n*3+2] = (( index2 ) << 6 | ( ( index3 ) & 0x3F ));
	}

	return out;
}


// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
// use window.btoa' step. According to my tests, this appears to be a faster approach:
// http://jsperf.com/encoding-xhr-image-data/5
// doesn't have to be reversable....



var xor_code_encodings = {};//'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
for( var a = 0; a < encodings.length; a++  ) {
   var r = (xor_code_encodings[encodings[a]]={} );
   for( var b = 0; b < encodings.length; b++  ) {
	r[encodings[b]] = encodings[a^b];
   }
}
xor_code_encodings['='] = {'=': '='};

function xor(a,b) {
  var c = "";
  for( var n = 0; n < a.length; n++ ) {
	c += xor_code_encodings[a[n]][b[n]];
  }
  return c
}
SaltyRNG.xor = xor;

function dexor(a,b,d,e) {
  var r = "";
  var n1 = (d-1)*((a.length/e)|0);
  var n2 = (d)*(a.length/e)|0;

  for( var n = 0; n < n1; n++ )
	r += a[n];
  for( ; n < n2; n++ )
	r += xor_code_encodings[a[n]][b[n]];
  for( ; n < n2; n++ )
	r += a[n];

  return r
}
SaltyRNG.dexor=dexor;

function txor(a,b) {
	const d = [...b].map( (c)=>c.codePointAt(0) );
	const keylen = d.length;
	return [...a].map( (c,n)=>String.fromCodePoint( c.codePointAt(0)^d[n%keylen] )).join("");
}
SaltyRNG.u16xor=txor;

function makeXKey( key, step ) {
    return { key : key, keybuf: key?base64ArrayBuffer(key):null, step: step?step:0
	, setKey(key,step) { this.key = key; this.keybuf = DecodeBase64Into( new Uint8Array(Math.ceil(key.length*3/4)), key); this.step = step?step:0; } };
}

function makeU16Key( ) {
    return SaltyRNG.u16generator();
}

SaltyRNG.xkey = makeXKey;
SaltyRNG.ukey = makeU16Key;


//   0x xx xx xx     7 bits
//   10 xx xx xx   0  continuation byte
//   mask 3f
//   11 0x xx xx   6  8-11 bits
//       X XX X_  0x1E  ( required bits )  0x1 allowed bits on first byte
//   11 10 xx xx   12  12-16 bits
//         XX XX   10 X_ __ __   required bits  0x1F (allowed bits on second)
//   11 11 0x xx   18  17-21 bits
//          X XX   10 XX __ __   0xF (allowed bits on second)
//   11 11 10 xx   24  22-26 bits
//            XX   10 XX X_ __   0x7 (allowed bits on second byte)
//   11 11 11 0x   30  27-31 bits
//             X   10 XX XX __  0x3 (allowed bits on second byte)

function u8xor_node(a,b) {
	let buf = Buffer.from(a, 'utf8');
	if( !b.keybuf ) { /*console.trace( "Key needs buf...." );*/ b.keybuf = Buffer.from( b.key, 'utf8' ); }
	let c = b.keybuf;//Buffer.from(b.key, 'utf8');
	//var buf = TE.encode(a);
	let outBuf = new Buffer.alloc( buf.length );
	let o = b.step;
	b.step += buf.length;
	let keylen = b.key.length-5;
	b.step %= keylen;
	let _mask = 0x3F;
	let l = 0;
        //console.log( "Decode length:", buf.length );
	for( var n = 0; n < buf.length; n++ ) {
		let v = buf[n];
		let mask = _mask;

		if( (v & 0x80) == 0x00 )      { if( l ) throw new Error( "short utf8 sequence found" ); mask=0x3f; _mask = 0x3f; }
		else if( (v & 0xC0) == 0x80 ) { if( !l ) throw new Error( "invalid utf8 sequence" ); l--; _mask = 0x3f; }
		else if( (v & 0xE0) == 0xC0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 1; mask=0x1;_mask = 0x3f; }  // 6 + 1 == 7
		else if( (v & 0xF0) == 0xE0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 2; mask=0;  _mask = 0x1f; }  // 6 + 5 + 0 == 11 
		else if( (v & 0xF8) == 0xF0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 3; mask=0;  _mask = 0x0f; }  // 6(2) + 4 + 0 == 16
		else if( (v & 0xFC) == 0xF8 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 4; mask=0;  _mask = 0x07; }  // 6(3) + 3 + 0 == 21
		else if( (v & 0xFE) == 0xFC ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 5; mask=0;  _mask = 0x03; }  // 6(4) + 2 + 0 == 26

		if( mask )
			outBuf[n] = (v & ~mask ) | ( u8xor_code_encodings2[ ((v & mask)<<7) + (c[(n+o)%(keylen)]) ] & mask );
		else
			outBuf[n] = v;
	}
	return outBuf.toString( "utf8" );
}

function u8xor(a,b) {
	//var buf = Buffer.from(a, 'utf8');
	var buf = TE.encode(a);
	if( !b.keybuf ) { /*console.trace( "Key needs buf...." );*/ b.keybuf = TE.encode( b.key ); }
	let c = b.keybuf;

	var outBuf = new Uint8Array( buf.length );
	var o = b.step;
	b.step += buf.length;
	var keylen = b.key.length-5;
	b.step %= keylen;
	let _mask = 0x3F;
	let l = 0;
	
	for( let n = 0; n < buf.length; n++ ) {
		let v = buf[n];
		let mask = _mask;

		if( (v & 0x80) == 0x00 )      { if( l ) throw new Error( "short utf8 sequence found" ); mask=0x3f; _mask = 0x3f; }
		else if( (v & 0xC0) == 0x80 ) { if( !l ) throw new Error( "invalid utf8 sequence" ); l--; _mask = 0x3f; }
		else if( (v & 0xE0) == 0xC0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 1; mask=0x1;_mask = 0x3f; }  // 6 + 1 == 7
		else if( (v & 0xF0) == 0xE0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 2; mask=0;  _mask = 0x1f; }  // 6 + 5 + 0 == 11 
		else if( (v & 0xF8) == 0xF0 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 3; mask=0;  _mask = 0x0f; }  // 6(2) + 4 + 0 == 16
		else if( (v & 0xFC) == 0xF8 ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 4; mask=0;  _mask = 0x07; }  // 6(3) + 3 + 0 == 21
		else if( (v & 0xFE) == 0xFC ) { if( l ) throw new Error( "short utf8 sequence found" ); l = 5; mask=0;  _mask = 0x03; }  // 6(4) + 2 + 0 == 26

		if( mask )
			outBuf[n] = (v & ~mask ) | ( u8xor_code_encodings2[ ((v & mask)<<7) + (c[(n+o)%(keylen)]) ] & mask );
		else
			outBuf[n] = v;
	}
	//console.log( "buf" , buf.toString('hex') );
	//console.log( "buf" , outBuf.toString('hex') );
	//return outBuf.toString( "utf8" );
	return TD.decode(outBuf);
}


SaltyRNG.u8xor = ("undefined" !== typeof Buffer)?u8xor_node:u8xor;

Object.freeze( SaltyRNG );

var TD;
var TE;

if( typeof TextDecoder === "undefined" ) {
	function myTextEncoder() {
		this.encode = function(s) {	
			var chars = [...s];
			var len = 0;
			for( var n = 0; n < chars.length; n++ ) {
				var chInt = chars[n].codePointAt(0);
				if( chInt < 128 ) 
					len++;
				else if( chInt < 0x800 ) 
					len += 2;
				else if( chInt < 0x10000 ) 
					len += 3;
				else if( chInt < 0x110000 ) 
					len += 4;
			}
			var out = new Uint8Array( len );
			len = 0;			
			for( var n = 0; n < chars.length; n++ ) {
				var chInt = chars[n].codePointAt(0);
				if( chInt < 128 ) 
					out[len++] = chInt;
				else if( chInt < 0x800 ) {
					out[len++] = ( (chInt & 0x7c0) >> 6 ) | 0xc0;
					out[len++] = ( (chInt & 0x03f) ) | 0x80;
				} else if( chInt < 0x10000 ) {
					out[len++] = ( (chInt & 0xf000) >> 12 ) | 0xE0;
					out[len++] = ( (chInt & 0x0fc0) >> 6 ) | 0x80;
					out[len++] = ( (chInt & 0x003f) ) | 0x80;
				} else if( chInt < 0x110000 ) {
					out[len++] = ( (chInt & 0x01c0000) >> 18 ) | 0xF0;
					out[len++] = ( (chInt & 0x003f000) >> 12 ) | 0xE0;
					out[len++] = ( (chInt & 0x0000fc0) >> 6 ) | 0x80;
					out[len++] = ( (chInt & 0x000003f) ) | 0x80;
				}
			}
			return out;
		};
	}
	function myTextDecoder() {
		this.decode = function(buf) {
			var out = '';
			for( var n = 0; n < buf.length; n++ ) {
				if( ( buf[n]& 0x80 ) == 0 )
					out += String.fromCodePoint( buf[n] );
				else if( ( buf[n] & 0xC0 ) == 0x80 ) ; else if( ( buf[n] & 0xE0 ) == 0xC0 ) {
					out += String.fromCodePoint( ( ( buf[n] & 0x1f ) << 6 ) | ( buf[n+1] & 0x3f ) );
					n++;
				} else if( ( buf[n] & 0xF0 ) == 0xE0 ) {
					out += String.fromCodePoint( ( ( buf[n] & 0xf ) << 12 ) | ( ( buf[n+1] & 0x3f ) << 6 ) | ( buf[n+2] & 0x3f ) );
					n+=2;
				} else if( ( buf[n] & 0xF8 ) == 0xF0 ) {
					out += String.fromCodePoint( ( ( buf[n] & 0x7 ) << 18 ) | ( ( buf[n+1] & 0x3f ) << 12 ) | ( ( buf[n+2] & 0x3f ) << 6 ) | ( buf[n+3] & 0x3f ) );
					n+=3;
				} else if( ( buf[n] & 0xFC ) == 0xF8 ) {
					out += String.fromCodePoint( ( ( buf[n] & 0x3 ) << 24 ) | ( ( buf[n+1] & 0x3f ) << 18 ) | ( ( buf[n+2] & 0x3f ) << 12 ) | ( ( buf[n+3] & 0x3f ) << 6 ) | ( buf[n+4] & 0x3f ) );
					n+=4;
				}
			}
			return out;
		};
	}
	TD = new myTextDecoder();
	TE = new myTextEncoder();
}
else {
	TD = new TextDecoder();
	TE = new TextEncoder();
}

const short_generator = SaltyRNG.Id;

const connections = new Map();

function makeProtocol(client) {

	function send(msg) {
		client.postMessage(msg);
	}

	function makeSocket() {
		const sock = {
			ws: null, // wait until we get a config to actually something...
			id: short_generator(),
			url : null,
			uiLoader : false,
		};
		connections.set(sock.id, sock);
		return sock;
	}

	function handleServiceMessage(e, msg) {
		//const msg = e.data;
		//console.log( "Worker received from main:", msg );
		if (msg.op === "connect") {
			const connection = makeSocket();
			connection.url = new URL( msg.address );
			protocol_.connection = connection;
			// callback events have to be associated with this e.source... (could pass that I suppose?)
			connection.ws = protocol.connect(msg.address, msg.protocol,
				(msg) => {
					e.source.postMessage({ op: "b", id: connection.id, msg: msg });	
				}
			);
		} else if (msg.op === "send") {
			const socket = connections.get(msg.id);
			if (socket) socket.ws.send(msg.msg);
			else send({ op: "disconnect", id: msg.id }); 
			//else throw new Error( "Socket to send to is closed:"+msg.id );
		} else if (msg.op === "close") {
			const socket = connections.get(msg.id);
			if (socket) socket.ws.close(msg.code, msg.reason);
			//else throw new Error( "Socket to close to is closed:"+msg.id );
		} else {
			console.log("Unhandled message:", msg);
			return false;
		}
		return true;
	}





	const protocol = {
		connect: openSocket,
		//login : login,
		connectTo: openSocket,
		handleServiceMessage,
		serviceLocal: null,  // set in sw.js
		connection: null,
		localStorage : null,   // unused; but set in sw.js
		resourceReply: null,  // set in sw.js
		getSocket( id ) {
			return connections.get(id);
		},
		get connections() { return connections; },
		send(sock, msg) {
			if ("object" === typeof msg) msg = JSOX.stringify(msg);
			const socket = connections.get(sock);
			if (socket) socket.ws.send(msg);
		},

	};

	const protocol_ = protocol; // this is a duplicate because openSocket has parameter 'protocol'

	function openSocket(peer, protocol, cb) {
		const ws = new WebSocket(peer, protocol);
		//console.log( "New connection ID:", protocol_.connectionId );

		//ws.id = protocol_.connection.id;
		const connection = protocol_.connection;
		protocol_.connection = null;
		connection.ws = ws;

		send({ op: "connecting", id: connection.id });

		//console.log( "Got websocket:", ws, Object.getPrototypeOf( ws ) );
		ws.onopen = function () {
			cb({ op: "open" }, ws);
		};
		ws.onmessage = function handleSockMessage(evt) {
			const msg_ = evt.data;
			if (msg_[0] === '\0') { 
				const msg = JSOX.parse(msg_.substr(1)); // kinda hate double-parsing this... 
				if (msg.op === 'got') {
					if (protocol_.resourceReply)
						protocol_.resourceReply(client, msg);
					return;
				}
			} else {
				const msg = JSOX.parse(msg_); // kinda hate double-parsing this... 
				if (msg.op === 'got') {
					if (protocol_.resourceReply)
						protocol_.resourceReply(client, msg);
					return;
				}
				send({ op: 'a', id: connection.id, msg: msg_ }); // just forward this.
			}
		};
		ws.onclose = function doClose(evt) {
			// event is a HTTP socket event type message.
			if (protocol.serviceLocal) {
				if (protocol.serviceLocal.uiSocket === ws.socket) {
					//console.log("clearing ui Socket so it doesn't send?");
					// fetches become default fallback...
					protocol.serviceLocal.uiSocket = null;
				}
			}
			connections.delete(ws.id);
			cb({ op: "close", id: connection.id, code:evt.code, reason:evt.reason });
			// websocket is closed.
		};
		return ws;
	}



	return protocol;

}

// THis is the main service worker service.
//   This handles websocket connections, and hooks into fetch() requests
//   Fetches might be satisified by the websocket, instead of requested over http.
//   This allows a single websocket service connection to serve interface elements also;
//    this can be dynamic images, or static content which is not publically available on a CDN.
//    This can be proprietary software; this can wrap code around websockets also; such as a 
//    transparent socket.IO layer sort of hook.
//
//     Specific forms and UI elmeents might hook themselves here also; but really any HTML element.
//
//   This is built with rollup. `npm run build`

const l_sw = {
	rid: 0,
	clients: new Map(),
	expectations: [],
};


self.addEventListener("activate", activation);
self.addEventListener("install", installation);

self.addEventListener("fetch", handleFetch);
self.addEventListener("message", handleMessage);


function activation(event) {
	//console.log( "ACTIVATION EVENT:", event );
	//console.log( "Outstanding clients:", l_sw.clients );
	clients.claim();
}

function installation(event) {
	//console.log( "INSTALLATION EVENT:", event );
	//console.log( "Outstanding clients:", l_sw.clients );
}

function resourceReply(client, msg) {
	client = l_sw.clients.get(client.id);
	//console.log( "Handle standard request....", msg, client.requests );
	const reqId = client.requests.findIndex((req) => req.id === msg.id);

	if (reqId >= 0) {
		const req = client.requests[reqId];
		clearTimeout(req.timeout);
		client.requests.splice(reqId, 1);
		const headers = new Headers(msg.response.headers);
		const response = new Response(msg.response.content, { status: msg.response.status, statusText: msg.response.statusText, headers: headers });
		//console.log( "Resolve with ressponce" );
		req.res(response);
	}
	else
		throw new Error("Outstanding request not found");

}

function getMessageClient(event) {
	let oldClient = null;
	if ("source" in event) {
		const clientId = event.source.id;
		oldClient = l_sw.clients.get(clientId);
		if (!oldClient) {
			const newClient = {
				client: event.source
				, requests: []
				, uiSocket: null
				, protocol: null
				, localStorage: null
				, peers: []
			};
			l_sw.clients.set(clientId, newClient);

			newClient.protocol = makeProtocol(newClient.client);
			newClient.protocol.resourceReply = resourceReply;
			newClient.protocol.serviceLocal = l_sw;

			newClient.localStorage = newClient.protocol.localStorage;

			return newClient;
		} else {
			return oldClient;
		}
	}

}

function getClient(event, asClient) {

	// need to figure out which socket to request on.
	const clientId =
		event.resultingClientId !== ""
			? event.resultingClientId
			: event.clientId;
	//console.log( "Attemping to get id from event instead...", clientId  );

	if (clientId) {
		const oldClient = l_sw.clients.get(clientId);
		if (oldClient) {
			return oldClient;
		}
		const newClient = {
			client: null  // event.source to send events to... but this is fetch result
			, requests: asClient && asClient.requests || []
			, uiSocket: asClient && asClient.uiSocket
			, protocol: asClient && asClient.protocol
			, localStorage: asClient && asClient.localStorage
			, peers: [asClient]
		};
		if (asClient) asClient.peers.push(newClient);
		l_sw.clients.set(clientId, newClient);

		self.clients.get(clientId).then((client) => {
			//console.log( "Clients resolve finally resulted??" );
			if (!client) {
				console.log("Client is not found... not a valid channel.", clientId, self.clients);
				return null;
			}
			newClient.client = client;
			if (!newClient.protocol) {
				newClient.protocol = makeProtocol(client);
				newClient.protocol.resourceReply = resourceReply;
				newClient.protocol.serviceLocal = l_sw;
				newClient.localStorage = newClient.protocol.localStorage;
			}
			//console.log( "Found client...", client );
			newClient.p = null; // outstanding promise no longer needed.
			return newClient;
		}).catch(err => { console.log("Error on getting client:", err); });
		return newClient;
	} else {
		console.log("Message from an unknowable location?!");
		return null;
	}
}


function handleFetch(event) {
	const req = event.request;
	let asClient = null;
	for (var e = 0; e < l_sw.expectations.length; e++) {
		const exp = l_sw.expectations[e];
		if (req.url.endsWith(exp.url)) {
			asClient = exp.client;
			l_sw.expectations.splice(e, 1);
			break;
		}
	}

	const client = getClient(event, asClient);
	const url = new URL( req.url );
	// not only the client; but the specific socket on the client....
let found = null;
	if( client.protocol )
	 for (const [key, ws] of client.protocol.connections){
			if( ws.uiLoader && url.origin === ws.url.origin )
				found = key;
		}
	const sock = found;

	event.respondWith(
		(() => {
			if (!client) {
				console.log("Client hasn't talked yet... and we don't have a socket for it.");
				return fetch(event.request);
			}
			//console.log( "FETCH:", req, client );
			if (req.method === "GET") {
				//console.log( "got Get request:", req.url );
				if (!client) {
					console.log("fetch event on a page we don't have a socket for...");
				}
				if (client && sock) {
					const url = req.url;
					const newEvent = { id: l_sw.rid++, event: event, res: null, rej: null, p: null, timeout: null };
					client.requests.push(newEvent);
					const p = new Promise((res, rej) => {
						newEvent.res = res; newEvent.rej = rej;
						newEvent.timeout = setTimeout(() => {

							console.log("5 second delay elapsed... reject");
							const response = new Response("Timeout", { status: 408, statusText: "Timeout" });
							res(response);
							//client.uiSocket = null;
							const reqId = client.requests.findIndex((client) => client.id === newEvent.id);
							if (reqId >= 0)
								client.requests.splice(reqId);

						}, 5000);
					});
					newEvent.p = p;

					//console.log( "Post event to corect socket...", client.uiSocket );

					client.protocol.send(sock//client.uiSocket
						, { op: "get", url: url, id: newEvent.id });
					return p;
				}
			}
			return fetch(event.request).catch( (err)=>{
				console.log( "thrown error isn't caught by paernt?", err );
			} );
		})()
	);
}

function handleMessage(event) {
	const msg = event.data;
	//console.log("HAndle message: (to get client)", msg );
	const client = getMessageClient(event); // captures event.source for later response

	if (msg.op === "Hello") ; else if (msg.op === "expect") {
		l_sw.expectations.push({ client: client, url: msg.url });
	} else if (msg.op === "GET") {
		// this comes back in from webpage which
		// actually handled the server's response...
		if (!client)
			console.log("Response to a fetch request to a client that is no longer valid?");
		// echo of fetch event to do actual work....
		// well... something.
		console.log( "Handle standard request....", msg );
		const reqId = client.requests.findIndex((client) => client.id === msg.id);
		if (reqId >= 0) {
			const req = client.requests[reqId];
			client.requests.splice(reqId);
			const headers = new Headers();
			for( let header in msg.headers ) {
				headers.append( header, msg.headers[header] );
			} 
			const response = new Response(msg.content
				, {
					headers: headers
					, status:msg.status
				 , statusText: msg.statusText
				}
			);
			// and finish the promise which replies to the
			// real client.
			req.p.res(response);
		} else {
			console.log("Failed to find the requested request" + event.data);
		}
	} else if (msg.op === "setUiLoader") {
		const sock = client.protocol.connections.get( msg.socket ); sock.uiLoader = msg.on;
		//client.uiSocket = msg.socket;
	} else if (msg.op === "setLoader") {
		// reply from getItem localStorage.
		client.localStorage.respond(msg.id);
	}
	else {
		if (client && client.protocol)
			client.protocol.handleServiceMessage(event, msg);
	}
}
