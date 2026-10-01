/* Biblo — sito. Tre cose sole, tutte facoltative: se una fallisce, la pagina
   resta perfettamente utilizzabile (i valori scritti nell'HTML restano validi).

   1. rifiniture: ombra dell'intestazione, comparsa in scorrimento, lingua ricordata,
      pulsante in cima del Mac per chi visita da un Mac (se la pagina offre il Mac)
   2. dati del rilascio letti da GitHub, cosi` versione/peso/link non vanno aggiornati a mano
   3. contatore dei download: mostrato SOLO se l'endpoint risponde davvero */

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

	// In cima ci sono i due download (Windows e Mac): per chi visita da un Mac
	// quello del Mac passa primo ed evidenziato, quello di Windows resta li`.
	var heroWin = document.querySelector('[data-hero-win]');
	var heroMac = document.querySelector('[data-hero-mac]');
	if (heroWin && heroMac && suMac()) {
		heroWin.classList.replace('btn-primary', 'btn-secondary');
		heroMac.classList.replace('btn-secondary', 'btn-primary');
		heroWin.parentNode.insertBefore(heroMac, heroWin);
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
})();
