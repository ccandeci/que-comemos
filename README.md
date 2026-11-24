# ¿Qué comemos?
Planificador de lunes a viernes para Argentina. HTML, CSS, JavaScript y JSON, sin API ni cuenta.

## Publicar en GitHub Pages
1. Creá un repositorio público en GitHub, por ejemplo `que-comemos`.
2. Descomprimí el ZIP. Subí los archivos que están dentro de la carpeta, incluido index.html, a la raíz del repositorio.
3. En Settings → Pages → Build and deployment, elegí Deploy from a branch, main y /(root), y guardá.
4. Abrí la dirección que muestra Pages. Podés añadirla a la pantalla de inicio del celular.

## Probar en tu PC
Desde la carpeta, en la terminal de Visual Studio Code, ejecutá `python -m http.server 8000` y abrí http://localhost:8000. No abras index.html por doble clic: el navegador puede bloquear la lectura del JSON.

## Datos
215 recetas iniciales: 150 cotidianas (incluyen combinaciones de plato principal y guarnición) y 65 internacionales. Cantidades aproximadas para adultos, escaladas desde una porción. Recetas internacionales adaptadas a la disponibilidad local, no verificadas individualmente contra fuentes culinarias. Los tiempos excluyen remojos. El algoritmo pondera estación, variedad, historial y coincidencias de verduras; no garantiza todas las preferencias si son incompatibles. Los filtros de exclusión y tiempo sí restringen las opciones; las comidas bloqueadas no se modifican. El presupuesto es relativo y orientativo. Las cantidades de compra representan necesidades netas, no precios ni tamaños de paquetes, salvo redondeo de unidades enteras.

Las preferencias se guardan en localStorage del navegador. Exportá/importá desde Preferencias para respaldarlas o trasladarlas. No hay sincronización entre dispositivos ni soporte PWA/offline en esta versión. La semana se guarda manualmente o al generar una nueva. Para agregar recetas, usá el formulario del recetario o editá recipes.json siguiendo su estructura: qty es por persona, unit es g/ml/u, base es 1. build_recipes.py permite reconstruir el recetario original, pero sobrescribe recipes.json. No lo ejecutes si modificaste ese archivo sin guardar copia.

Esta versión no automatiza todavía sobras, cálculo por presentaciones comerciales, edición de cantidades de recetas existentes ni selección directa de país. La receta internacional se puede regenerar individualmente. No es un plan nutricional profesional.