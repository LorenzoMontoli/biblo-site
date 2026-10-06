/* Biblo — sito. Quattro cose sole, tutte facoltative: se una fallisce, la
   pagina resta perfettamente utilizzabile (i valori scritti nell'HTML restano validi).

   1. rifiniture: ombra dell'intestazione, comparsa in scorrimento, lingua ricordata,
      pulsante in cima del Mac per chi visita da un Mac (se la pagina offre il Mac)
   2. dati del rilascio letti da GitHub, cosi` versione/peso/link non vanno aggiornati a mano
   3. contatore dei download: mostrato SOLO se l'endpoint risponde davvero
   4. promemoria via email per chi arriva dal telefono (finestra #promemoria) */

(function () {
	'use strict';

	var CFG = window.BIBLO_SITE || {};
	var LANG = document.documentElement.lang || 'en';

	/* ---------- 1. rifiniture ---------------------------------------- */

	var header = document.querySelector('.site-header');
	if (header) {
		var onScroll = function () {
			header.classList.toggle('is-stuck', window.scrollY > 8);
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
	}

	var reveals = document.querySelectorAll('.reveal');
	if ('IntersectionObserver' in window && reveals.length) {
		var io = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (e) {
					if (e.isIntersecting) {
						e.target.classList.add('is-in');
						io.unobserve(e.target);
					}
				});
			},
			{ rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
		);
		reveals.forEach(function (el) {
			io.observe(el);
		});
	} else {
		reveals.forEach(function (el) {
			el.classList.add('is-in');
		});
	}

	// Il video in cima: chi ha chiesto al sistema meno movimento lo trova
	// fermo sulla copertina, coi comandi per avviarlo se vuole.
	var filmato = document.querySelector('video.filmato');
	if (filmato && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		filmato.removeAttribute('autoplay');
		filmato.pause();
		filmato.controls = true;
	}

	// Lingua scelta dal selettore: ricordata per il prossimo ingresso dalla radice.
	document.querySelectorAll('.lang-picker a').forEach(function (a) {
		a.addEventListener('click', function () {
			try {
				localStorage.setItem('biblo_site_lang', a.getAttribute('hreflang'));
			} catch (e) {
				/* niente memoria: pazienza, si riparte dalla lingua del browser */
			}
		});
	});

	/* ---------- 1b. chi visita da un Mac ------------------------------ */

	// La pagina e` statica e uguale per tutti, quindi il pulsante principale
	// e` quello di Windows. Se la pagina offre anche il Mac (il pulsante Mac
	// esiste solo quando config.json ha `release.mac`) e chi guarda e` su un
	// Mac, il pulsante in cima e la riga sotto diventano quelli del Mac.
	function suMac() {
		try {
			var uad = navigator.userAgentData;
			var piattaforma =
				(uad && uad.platform) || navigator.platform || navigator.userAgent || '';
			// Safari su iPad si presenta come un Mac ("MacIntel"): lo tradisce il
			// touch, che sui Mac non c'e`.
			return /mac/i.test(piattaforma) && !(navigator.maxTouchPoints > 1);
		} catch (e) {
			return false;
		}
	}

	// In cima ci sono i due download (Windows e Mac), tutti e due blu: per chi
	// visita da un Mac quello del Mac passa primo.
	var heroWin = document.querySelector('[data-hero-win]');
	var heroMac = document.querySelector('[data-hero-mac]');
	if (heroWin && heroMac && suMac()) {
		heroWin.parentNode.insertBefore(heroMac, heroWin);
	}
	// Lo stesso nella sezione Scarica, dove chi arriva dal QR della locandina
	// con un Mac atterra direttamente (/promemoria -> #download).
	var sceltaMac = document.querySelector('.dl-choices [data-download-mac]');
	sceltaMac = sceltaMac && sceltaMac.closest('.dl-choice');
	if (sceltaMac && sceltaMac.previousElementSibling && suMac()) {
		sceltaMac.parentNode.insertBefore(sceltaMac, sceltaMac.parentNode.firstElementChild);
	}

	/* ---------- 2. dati del rilascio da GitHub ------------------------ */

	function fmtSize(bytes) {
		if (!bytes) return null;
		var mb = bytes / 1048576;
		return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
	}

	function fmtDate(iso) {
		try {
			return new Intl.DateTimeFormat(LANG, {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			}).format(new Date(iso));
		} catch (e) {
			return iso.slice(0, 10);
		}
	}

	function setText(sel, value) {
		if (!value) return;
		document.querySelectorAll(sel).forEach(function (el) {
			el.textContent = value;
		});
	}

	if (CFG.repo) {
		// Si chiede l'ELENCO delle release, non solo l'ultima: il contatore deve
		// sommare i download di tutte le versioni, altrimenti ogni volta che se ne
		// pubblica una nuova il totale riparte da zero (e il blocco sparisce).
		fetch('https://api.github.com/repos/' + CFG.repo + '/releases?per_page=100', {
			headers: { Accept: 'application/vnd.github+json' }
		})
			.then(function (r) {
				if (!r.ok) throw new Error('no releases');
				return r.json();
			})
			.then(function (elenco) {
				var EXE = /\.exe$/i;
				var DMG = /\.dmg$/i;
				var pubblicate = (elenco || []).filter(function (x) {
					return !x.draft && !x.prerelease;
				});
				function primoAsset(x, re) {
					return (x.assets || []).filter(function (a) {
						return re.test(a.name);
					})[0];
				}
				// La piu` recente e` la prima: l'API le restituisce in ordine di
				// creazione decrescente. Le release non-app (es. il modello) sono
				// fuori perche' non hanno ne' un .exe ne' un .dmg.
				var conInstaller = pubblicate.filter(function (x) {
					return primoAsset(x, EXE);
				});
				var conDmg = pubblicate.filter(function (x) {
					return primoAsset(x, DMG);
				});

				// Download VERI delle app (installer Windows + dmg del Mac), contati da
				// GitHub su TUTTE le versioni: nessun server da tenere in piedi e un
				// numero piu` onesto dei clic sul pulsante (chi clicca e annulla non
				// conta). Un contatore proprio, se configurato, ha comunque la
				// precedenza — vedi piu` sotto.
				var scaricati = 0;
				pubblicate.forEach(function (x) {
					(x.assets || []).forEach(function (a) {
						if (EXE.test(a.name) || DMG.test(a.name)) scaricati += a.download_count || 0;
					});
				});
				if (scaricati > 0) showCount(scaricati, 'github');

				// Mac: i pulsanti ci sono solo se la pagina offre il Mac. Senza un
				// .dmg pubblicato restano sulla pagina dei rilasci.
				if (conDmg.length) {
					var dmg = primoAsset(conDmg[0], DMG);
					setText('[data-release-size-mac]', fmtSize(dmg.size));
					document.querySelectorAll('[data-download-mac]').forEach(function (a) {
						a.setAttribute('href', dmg.browser_download_url);
					});
				}

				if (!conInstaller.length) throw new Error('no installer');

				var rel = conInstaller[0];
				var asset = primoAsset(rel, EXE);
				setText('[data-release-version]', String(rel.tag_name || '').replace(/^v/, ''));
				if (rel.published_at) setText('[data-release-date]', fmtDate(rel.published_at));
				if (asset) {
					setText('[data-release-size]', fmtSize(asset.size));
					document.querySelectorAll('[data-download-link]').forEach(function (a) {
						a.setAttribute('href', asset.browser_download_url);
					});
				}
			})
			.catch(function () {
				// Repo non ancora pubblico, nessuna release, o rete assente: restano i
				// valori scritti nell'HTML e si avverte che il file non c'e` ancora.
				document.querySelectorAll('[data-release-missing]').forEach(function (el) {
					el.hidden = false;
				});
			});
	}

	/* ---------- 3. contatore dei download ----------------------------- */

	var counters = document.querySelectorAll('[data-counter]');
	var fonteContatore = null; // 'github' | 'endpoint' — l'endpoint proprio vince

	function showCount(n, fonte) {
		if (typeof n !== 'number' || !isFinite(n) || n < 0) return;
		if (fonteContatore === 'endpoint' && fonte !== 'endpoint') return;
		fonteContatore = fonte;
		var txt;
		try {
			txt = new Intl.NumberFormat(LANG).format(n);
		} catch (e) {
			txt = String(n);
		}
		counters.forEach(function (c) {
			var v = c.querySelector('[data-counter-value]');
			if (v) v.textContent = txt;
			c.classList.add('is-on');
		});
	}

	if (CFG.counter && counters.length) {
		fetch(CFG.counter, { headers: { Accept: 'application/json' } })
			.then(function (r) {
				if (!r.ok) throw new Error('no counter');
				return r.json();
			})
			.then(function (d) {
				showCount(d && d.total, 'endpoint');
			})
			.catch(function () {
				// Nessun contatore proprio: resta buono quello di GitHub, e se manca
				// anche quello il blocco non compare — mai un numero inventato.
			});
	}

	// Click sul pulsante di download: segnala l'avvio del download e prosegue.
	document.querySelectorAll('[data-download-link], [data-download-mac]').forEach(function (a) {
		a.addEventListener('click', function () {
			if (!CFG.counter) return;
			try {
				if (navigator.sendBeacon) {
					navigator.sendBeacon(CFG.counter, new Blob([], { type: 'text/plain' }));
				} else {
					fetch(CFG.counter, { method: 'POST', keepalive: true }).catch(function () {});
				}
			} catch (e) {
				/* il conteggio non deve mai ostacolare il download */
			}
		});
	});

	/* ---------- 4. promemoria via email (dal telefono) ----------------- */

	// Biblo e` un'app per computer: chi arriva dal telefono (il QR della
	// locandina porta a /promemoria, che apre la pagina con `?promemoria`)
	// si fa mandare il link per email, oppure se lo condivide da solo. L'email
	// la spedisce il Worker di Cloudflare (site/worker): qui si manda solo
	// indirizzo, lingua della pagina e il gettone di Turnstile, che dice al
	// Worker che a chiedere e` una persona. Turnstile si carica solo quando la
	// finestra si apre, mai per chi visita e basta.
	var R = window.BIBLO_REMINDER;
	var dlg = document.getElementById('promemoria');
	if (R && dlg) {
		var form = dlg.querySelector('[data-reminder-form]');
		var input = dlg.querySelector('#reminder-email');
		var trappola = dlg.querySelector('input[name="sito"]');
		var stato = dlg.querySelector('[data-reminder-status]');
		var invia = dlg.querySelector('[data-reminder-send]');
		var fatto = dlg.querySelector('[data-reminder-done]');
		var box = dlg.querySelector('[data-reminder-captcha]');
		var conEmail = !!(R.endpoint && R.sitekey && form);
		var widget = null;
		var caricando = false;
		var guasto = false; // Turnstile non si e` caricato (rete, blocchi)
		var gettone = '';
		var inAttesa = false;
		// Finche' il Worker non c'e` (config senza indirizzo o chiave di
		// Turnstile) la finestra offre solo la condivisione.
		if (!conEmail) {
			if (form) form.hidden = true;
			var oppure = dlg.querySelector('[data-reminder-or]');
			if (oppure) oppure.hidden = true;
		}

		var scrivi = function (testo, tipo) {
			if (!stato) return;
			stato.textContent = testo || '';
			stato.className = 'reminder-status' + (tipo ? ' is-' + tipo : '');
		};

		var caricaTurnstile = function () {
			if (!conEmail || widget !== null || caricando) return;
			caricando = true;
			window.__bibloTurnstile = function () {
				try {
					widget = window.turnstile.render(box, {
						sitekey: R.sitekey,
						language: LANG,
						action: 'promemoria',
						appearance: 'interaction-only',
						callback: function (t) {
							gettone = t;
							if (inAttesa) spedisci();
						},
						'expired-callback': function () {
							gettone = '';
						},
						'error-callback': function () {
							gettone = '';
							if (inAttesa) {
								inAttesa = false;
								scrivi(R.msgs.err_captcha, 'error');
							}
						}
					});
				} catch (e) {
					guasto = true;
				}
			};
			var s = document.createElement('script');
			s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__bibloTurnstile';
			s.async = true;
			// Se non si carica lo si dice solo quando si prova a spedire, e la
			// condivisione qui sotto funziona comunque.
			s.onerror = function () {
				caricando = false;
				guasto = true;
				if (inAttesa) {
					inAttesa = false;
					scrivi(R.msgs.err_captcha, 'error');
				}
			};
			document.head.appendChild(s);
		};

		var apri = function () {
			if (typeof dlg.showModal === 'function') {
				if (!dlg.open) dlg.showModal();
			} else {
				dlg.setAttribute('open', '');
			}
			document.documentElement.classList.add('has-dialog');
			caricaTurnstile();
		};
		var chiudi = function () {
			if (typeof dlg.close === 'function') {
				if (dlg.open) dlg.close();
			} else {
				dlg.removeAttribute('open');
			}
			document.documentElement.classList.remove('has-dialog');
		};
		dlg.addEventListener('close', function () {
			document.documentElement.classList.remove('has-dialog');
		});
		// un tocco fuori dalla scheda (sullo sfondo) chiude
		dlg.addEventListener('click', function (e) {
			if (e.target === dlg) chiudi();
		});
		document.querySelectorAll('[data-reminder-open]').forEach(function (b) {
			b.addEventListener('click', apri);
		});
		dlg.querySelectorAll('[data-reminder-close]').forEach(function (b) {
			b.addEventListener('click', chiudi);
		});

		var spedisci = function () {
			var email = (input.value || '').trim();
			if (!email || !input.checkValidity()) {
				inAttesa = false;
				scrivi(R.msgs.err_email, 'error');
				input.focus();
				return;
			}
			// il gettone arriva da solo poco dopo l'apertura: se non c'e` ancora,
			// si aspetta lui e si spedisce appena arriva
			if (!gettone) {
				if (guasto) {
					// riprova a caricarlo: magari la rete e` tornata
					guasto = false;
					widget = null;
				}
				inAttesa = true;
				scrivi(R.msgs.wait_captcha);
				caricaTurnstile();
				return;
			}
			inAttesa = false;
			var t = gettone;
			gettone = '';
			invia.disabled = true;
			scrivi(R.msgs.sending);
			fetch(R.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: email, lang: LANG, token: t, sito: trappola ? trappola.value : '' })
			})
				.then(function (r) {
					return r.json().catch(function () {
						return {};
					});
				})
				.then(function (j) {
					if (j && j.ok) {
						form.hidden = true;
						fatto.hidden = false;
						scrivi('');
						return;
					}
					var e = j && j.error;
					scrivi(
						e === 'invalid_email'
							? R.msgs.err_email
							: e === 'captcha'
								? R.msgs.err_captcha
								: e === 'rate_limited'
									? R.msgs.err_busy
									: R.msgs.err_generic,
						'error'
					);
				})
				.catch(function () {
					scrivi(R.msgs.err_generic, 'error');
				})
				.then(function () {
					invia.disabled = false;
					// un gettone vale una volta sola: se ne chiede subito un altro
					if (widget !== null && window.turnstile) {
						try {
							window.turnstile.reset(widget);
						} catch (e) {
							/* niente */
						}
					}
				});
		};
		if (form) {
			form.addEventListener('submit', function (e) {
				e.preventDefault();
				spedisci();
			});
		}

		// Condividere da soli: il foglio di condivisione del telefono, o
		// altrimenti il link copiato negli appunti. Non passa niente da noi.
		var condividi = dlg.querySelector('[data-reminder-share]');
		var esitoCond = dlg.querySelector('[data-reminder-share-status]');
		if (condividi) {
			condividi.addEventListener('click', function () {
				if (navigator.share) {
					navigator.share({ title: 'Biblo', text: R.msgs.share_text, url: R.url }).catch(function () {
						/* annullata da chi condivide: va bene cosi` */
					});
					return;
				}
				var copiato = function () {
					if (esitoCond) {
						esitoCond.textContent = R.msgs.copied;
						esitoCond.classList.add('is-ok');
					}
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(R.url).then(copiato, function () {
						if (esitoCond) esitoCond.textContent = R.url;
					});
				} else if (esitoCond) {
					esitoCond.textContent = R.url;
				}
			});
		}

		// Dal QR: la pagina si apre con `?promemoria` e la finestra gia` aperta;
		// il parametro poi sparisce, cosi` un ricaricamento non la riapre.
		if (/[?&]promemoria(=|&|$)/.test(location.search)) {
			apri();
			try {
				history.replaceState(null, '', location.pathname + location.hash);
			} catch (e) {
				/* niente: resta il parametro, pazienza */
			}
		}
	}
})();
