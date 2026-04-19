# ReRack – HTML/CSS/JS Vanilla

Proyecto convertido a HTML + CSS + JS puro. Sin React, sin Tailwind, sin dependencias.

## Estructura de archivos

```
rerack/
├── index.html      → Página de inicio
├── editeur.html    → Editor 2D de muebles
├── galerie.html    → Galería comunitaria
├── login.html      → Página de login
├── style.css       → TODOS los estilos (modifique aquí)
├── app.js          → Código compartido (auth, header, toast)
├── editeur.js      → Lógica del editor (canvas, profilés, fiche)
├── galerie.js      → Lógica de la galería (filtros, likes)
└── README.md       → Este archivo
```

## Cómo abrir en VSCode

1. Abra VSCode
2. Archivo → Abrir Carpeta → seleccione esta carpeta `rerack`
3. Instale la extensión **Live Server** (clic en Extensions, busque "Live Server")
4. Clic derecho en `index.html` → **Open with Live Server**
5. ¡El sitio se abre en su navegador!

## Cómo modificar

### Colores
En `style.css`, al inicio del archivo hay variables CSS:
```css
:root {
  --green: #059669;       /* Color principal verde */
  --green-dark: #065f46;  /* Verde oscuro */
  --blue: #2563eb;        /* Azul */
  /* ... */
}
```
Cambie esos valores para cambiar toda la paleta de colores.

### Textos / Contenido
Cada página `.html` contiene directamente el texto. Búsquelo y modifíquelo.

### Profilés (materiales)
En `editeur.js`, al inicio del archivo:
```js
const PROFILE_TYPES = [
  {
    id: 'profile-74x74',
    name: 'Profilé 74×74',
    color: '#10b981',
    fixedWidth: 7.4,
    fixedHeight: 7.4,
    defaultLength: 190,
    maxLength: 190,
    pricePerUnit: 5000,   // Precio en FCFA
    weightPerUnit: 8,     // Peso en kg
  },
  // ...
];
```

### Proyectos de la galería
En `galerie.js`, el array `DEFAULT_PROJECTS` contiene los proyectos de ejemplo.

## Funcionalidades

- ✅ Página de inicio con hero, secciones, CTA
- ✅ Editor 2D: arrastrar profilés, redimensionar, rotar, borrar
- ✅ Estimación de coste y peso automática
- ✅ Fiche technique para el obrero (descarga HTML → PDF)
- ✅ Galería con filtros, búsqueda, likes
- ✅ Compartir a la galería
- ✅ Guardar/cargar proyecto (localStorage)
- ✅ Login simple (localStorage)
- ✅ Responsive (móvil y escritorio)
- ✅ Sin ninguna dependencia externa
