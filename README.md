# ¿Qué comemos?

Planificador argentino de almuerzos y cenas de lunes a viernes, con porciones para 2 o 4 personas por comida y una experiencia internacional por semana. El recetario trae 250 platos, 150 cotidianos y 100 internacionales. [Abrir en GitHub Pages](https://ccandeci.github.io/que-comemos/)

## Cuenta y hogar

Se puede usar desde el primer momento en modo local. Para compartir los datos, cada persona crea su propia cuenta y confirma su correo. Una crea el hogar desde el botón de cuenta. Al crearlo, el menú y los datos del modo local de ese dispositivo pasan a ser los datos iniciales del hogar.

Desde **Mi hogar**, quien lo creó genera un enlace para el correo de su pareja y se lo envía por el canal que prefiera. La otra persona abre el enlace, ingresa con ese correo y acepta. El enlace vence en 48 horas y se consume al vincular la cuenta. Generar otro reemplaza el anterior. Si la confirmación del correo se abre en otro navegador, volvés a abrir el enlace original de invitación. Los datos que la pareja tenía en modo local siguen disponibles al cerrar sesión o desde **Mi hogar → Exportar datos del modo local**.

Se comparten el menú, las porciones, las compras y sus tildes, la despensa, los favoritos, el historial, las exclusiones, las recetas propias, las calificaciones y las preferencias. Cada dispositivo conserva una copia de sus cambios pendientes. Al volver a conectarse, la app combina cambios compatibles y permite elegir una versión si ambos tocaron los mismos datos. En **Preferencias** se puede exportar o importar una copia. Importar reemplaza los datos del espacio abierto, incluido el hogar si está activo.

## Instalar en el celular

En Chrome para Android, abrí el menú del navegador y elegí **Instalar aplicación** o **Agregar a la pantalla principal**. En Safari para iPhone, usá **Compartir → Agregar a inicio**. Una vez cargada, la app conserva los archivos del recetario y la interfaz para poder abrirlos sin conexión. El alta, el ingreso inicial y la vinculación requieren conexión.

## Desarrollo

Serví la carpeta con `python3 -m http.server 8765` y abrí http://localhost:8765. El recetario se regenera con `python3 build_recipes.py`. Las cantidades se guardan por persona y se escalan en la app. Usá `g`, `ml` o `u` para los ingredientes. Se recomienda incrementar la versión de la caché en `sw.js` al publicar cambios de archivos estáticos.

GitHub Pages sirve la raíz de `main`. El frontend usa la API pública del proyecto Supabase `tvfoihbgdcsrtxswvnpj` y el cliente oficial `@supabase/supabase-js` 2.119.2, distribuido junto al sitio con su licencia. `supabase/household_sync.sql` registra los cambios para el esquema existente con `households` y `household_items`. Las altas requieren confirmación de correo. Para destinatarios ajenos al equipo, Supabase requiere SMTP propio si el proyecto usa el remitente predeterminado. La URL de Pages debe estar permitida en la configuración de redirecciones de Auth. [Documentación de correo de Supabase](https://supabase.com/docs/guides/auth/auth-smtp)

Los tiempos son orientativos y pueden excluir remojos. Las cantidades de compra son necesidades netas después de descontar despensa. El algoritmo pondera la estación, la variedad y el historial, y respeta los filtros y las comidas bloqueadas. Con filtros muy restrictivos pueden quedar comidas sin propuesta.
