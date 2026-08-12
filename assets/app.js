/* Biblo — sito. Tre cose sole, tutte facoltative: se una fallisce, la pagina
   resta perfettamente utilizzabile (i valori scritti nell'HTML restano validi).

   1. rifiniture: ombra dell'intestazione, comparsa in scorrimento, lingua ricordata
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
		fetch('https://api.github.com/repos/' + CFG.repo + '/releases/latest', {
			headers: { Accept: 'application/vnd.github+json' }
		})
			.then(function (r) {
				if (!r.ok) throw new Error('no release');
				return r.json();
			})
			.then(function (rel) {
				// Download VERI dell'installer, contati da GitHub: nessun server da
				// tenere in piedi e un numero piu` onesto dei clic sul pulsante (chi
				// clicca e annulla non conta). Se e` configurato un contatore proprio,
				// quello ha la precedenza — vedi piu` sotto.
				var scaricati = (rel.assets || []).reduce(function (s, a) {
					return s + (a.download_count || 0);
				}, 0);
				if (scaricati > 0) showCount(scaricati, 'github');

				var asset = (rel.assets || []).filter(function (a) {
					return /\.exe$/i.test(a.name);
				})[0];
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
	document.querySelectorAll('[data-download-link]').forEach(function (a) {
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
