# ~/ioshiro

Raccolta personale di link. Jekyll nativo di GitHub Pages: online niente build e niente dipendenze.

## In locale

```sh
bun install
bun run dev        # http://localhost:4000
```

Anteprima senza Ruby/Jekyll: `scripts/dev.mjs` compila `index.html` con liquidjs (lo stesso linguaggio di template di Jekyll) e ricarica la pagina quando salvi un file. Se `links.yml` ha un errore, al posto della pagina vedi il messaggio d'errore. `package.json`, `scripts/` e `node_modules/` restano fuori da Pages.

## Pubblicare

1. Push su GitHub.
2. Settings → Pages → Deploy from a branch → `main` / root.
3. Settings → Actions → General → Workflow permissions → **Read and write**.
4. Crea la label `link` (Issues → Labels).

## Aggiungere un link

- **Dalla pagina**: `+ proponi un link` in fondo apre una issue col form vuoto.
- **Bookmarklet**: crea un preferito con questo indirizzo. Apre la stessa issue con titolo e URL della pagina corrente già compilati: scegli categoria, invia.

  ```js
  javascript:void(open('https://github.com/Ioshiro/ioshiro-links/issues/new?template=add-link.yml&title='+encodeURIComponent(document.title)+'&url='+encodeURIComponent(location.href)))
  ```

  In entrambi i casi la Action appende la voce a `_data/links.yml`, fa il commit e chiude la issue. Le issue di altri utenti vengono ignorate.
- **A mano**: aggiungi una voce in fondo a `_data/links.yml`.

```yaml
- url: "https://…"
  title: "Titolo"
  cat: "dev/rust/async"   # categoria/sottocategoria/…
  desc: "Una riga."
  tags: [perf, tokio]
  added: 2026-10-08
```

## Ricerca

`/` mette il focus sulla ricerca, `Esc` la svuota. Filtri e query finiscono nell'URL (`?cat=art&q=dither`), quindi si possono salvare.

## Crediti

Scena [tokyo rain](https://ascii.rest/tokyo-rain/) di [@bas3line](https://github.com/bas3line) (MIT, caricata da ascii.rest). Font [Departure Mono](https://departuremono.com/) e [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (OFL), inclusi in `assets/fonts`.
