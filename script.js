const $ = id => document.getElementById(id);

const sigma = $("sigma");
const rho = $("rho");
const beta = $("beta");

const x0 = $("x0");
const y0 = $("y0");
const z0 = $("z0");
const dtControl = $("dt");
const duracionControl = $("duracion");

const canvas = $("grafico");
const ctx = canvas.getContext("2d");

const CLAVE = "historialSistemaLorenz";

let actual = { x: 1, y: 1, z: 1 };
let segundo = { x: 1.01, y: 1, z: 1 };

let puntos = [];
let puntos2 = [];
let tiempo = 0;
let ejecutando = false;
let intervalo = null;

// Obtener parámetros actuales
function parametros() {
    return {
        sigma: Number(sigma.value),
        rho: Number(rho.value),
        beta: Number(beta.value)
    };
}

// Ecuaciones diferenciales del Sistema de Lorenz
function derivadas(s) {
    const p = parametros();

    return {
        x: p.sigma * (s.y - s.x),
        y: s.x * (p.rho - s.z) - s.y,
        z: s.x * s.y - p.beta * s.z
    };
}

// Sumar estados
function sumar(s, k, factor) {
    return {
        x: s.x + factor * k.x,
        y: s.y + factor * k.y,
        z: s.z + factor * k.z
    };
}

// Método Runge-Kutta de cuarto orden
function rk4(s) {
    const h = Number(dtControl.value);

    const k1 = derivadas(s);
    const k2 = derivadas(sumar(s, k1, h / 2));
    const k3 = derivadas(sumar(s, k2, h / 2));
    const k4 = derivadas(sumar(s, k3, h));

    return {
        x: s.x + h * (k1.x + 2*k2.x + 2*k3.x + k4.x) / 6,
        y: s.y + h * (k1.y + 2*k2.y + 2*k3.y + k4.y) / 6,
        z: s.z + h * (k1.z + 2*k2.z + 2*k3.z + k4.z) / 6
    };
}

// Actualizar resultados numéricos
function actualizarResultados() {
    $("resultadoX").textContent = actual.x.toFixed(5);
    $("resultadoY").textContent = actual.y.toFixed(5);
    $("resultadoZ").textContent = actual.z.toFixed(5);
    $("tiempo").textContent = tiempo.toFixed(3);
    $("cantidadPuntos").textContent = puntos.length;
}

// Crear un paso de la simulación
function paso() {
    const h = Number(dtControl.value);

    actual = rk4(actual);
    puntos.push({ ...actual });

    if ($("comparar").checked) {
        segundo = rk4(segundo);
        puntos2.push({ ...segundo });
    }

    tiempo += h;
    actualizarResultados();
}

// Dibujar una trayectoria en el plano X-Z
function dibujarLinea(lista, minX, maxX, minZ, maxZ, color) {
    if (lista.length < 2) return;

    const margen = 40;
    const ancho = canvas.width - margen * 2;
    const alto = canvas.height - margen * 2;

    const escalaX = ancho / Math.max(maxX - minX, 0.001);
    const escalaZ = alto / Math.max(maxZ - minZ, 0.001);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;

    lista.forEach((p, i) => {
        const px = margen + (p.x - minX) * escalaX;
        const py = canvas.height - margen - (p.z - minZ) * escalaZ;

        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    });

    ctx.stroke();
}

// Dibujar gráfica
function dibujar() {
    ctx.fillStyle = "#101c30";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const todos = puntos.concat($("comparar").checked ? puntos2 : []);

    if (todos.length < 2) {
        ctx.fillStyle = "white";
        ctx.font = "17px Arial";
        ctx.fillText("Presiona Iniciar para comenzar la simulación", 35, 55);
        return;
    }

    const xs = todos.map(p => p.x);
    const zs = todos.map(p => p.z);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    dibujarLinea(puntos, minX, maxX, minZ, maxZ, "#36d6c5");

    if ($("comparar").checked) {
        dibujarLinea(puntos2, minX, maxX, minZ, maxZ, "#ffb84d");
    }

    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText("X", canvas.width - 25, canvas.height - 15);
    ctx.fillText("Z", 15, 20);
}

// Avanzar la simulación
function avanzar() {
    const h = Number(dtControl.value);
    const limite = Number(duracionControl.value);

    for (let i = 0; i < 100; i++) {
        if (tiempo + h > limite + 1e-10) {
            detener();
            $("estado").textContent = "Estado: simulación finalizada";
            dibujar();
            return;
        }

        paso();
    }

    dibujar();
}

// Iniciar simulación
function iniciar() {
    if (ejecutando) return;

    const limite = Number(duracionControl.value);

    if (limite <= 0 || Number(dtControl.value) <= 0) {
        alert("Ingresa un paso de tiempo y una duración válidos.");
        return;
    }

    if (puntos.length === 0) {
        actual = {
            x: Number(x0.value),
            y: Number(y0.value),
            z: Number(z0.value)
        };

        segundo = {
            x: Number(x0.value) + 0.01,
            y: Number(y0.value),
            z: Number(z0.value)
        };

        tiempo = 0;
        puntos.push({ ...actual });

        if ($("comparar").checked) {
            puntos2.push({ ...segundo });
        }

        actualizarResultados();
        dibujar();
    }

    if (tiempo >= limite) {
        $("estado").textContent = "Estado: duración alcanzada. Restablece para repetir.";
        return;
    }

    ejecutando = true;
    $("estado").textContent = "Estado: simulando";
    intervalo = setInterval(avanzar, 20);
}

// Pausar
function detener() {
    ejecutando = false;
    clearInterval(intervalo);
    intervalo = null;
}

// Restablecer
function reiniciar() {
    detener();

    tiempo = 0;
    puntos = [];
    puntos2 = [];

    actual = {
        x: Number(x0.value),
        y: Number(y0.value),
        z: Number(z0.value)
    };

    segundo = {
        x: Number(x0.value) + 0.01,
        y: Number(y0.value),
        z: Number(z0.value)
    };

    actualizarResultados();
    dibujar();

    $("estado").textContent = "Estado: detenido";
}

// Mostrar los parámetros en pantalla
function actualizarParametros() {
    $("sigmaValue").textContent = Number(sigma.value).toFixed(1);
    $("rhoValue").textContent = Number(rho.value).toFixed(1);
    $("betaValue").textContent = Number(beta.value).toFixed(2);
}

// Leer historial almacenado
function obtenerHistorial() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE)) || [];
    } catch (error) {
        return [];
    }
}

// Guardar registro de la simulación
function guardarRegistro() {
    if (puntos.length === 0) {
        alert("Primero debes ejecutar una simulación.");
        return;
    }

    const p = parametros();

    const registro = {
        fecha: new Date().toLocaleString("es-EC"),
        sigma: p.sigma,
        rho: p.rho,
        beta: p.beta,
        x0: Number(x0.value),
        y0: Number(y0.value),
        z0: Number(z0.value),
        dt: Number(dtControl.value),
        duracionConfigurada: Number(duracionControl.value),
        tiempoFinal: tiempo,
        xFinal: actual.x,
        yFinal: actual.y,
        zFinal: actual.z,
        cantidadPuntos: puntos.length,
        comparacion: $("comparar").checked ? "Sí" : "No"
    };

    const historial = obtenerHistorial();
    historial.push(registro);

    try {
        localStorage.setItem(CLAVE, JSON.stringify(historial));
        mostrarHistorial();
        alert("Registro guardado correctamente en este navegador.");
    } catch (error) {
        alert("No se pudo guardar. Es posible que el almacenamiento esté lleno.");
    }
}

// Mostrar registros guardados
function mostrarHistorial() {
    const historial = obtenerHistorial();
    const contenedor = $("historial");

    if (historial.length === 0) {
        contenedor.innerHTML = "<p>No hay registros guardados.</p>";
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>σ</th>
                    <th>ρ</th>
                    <th>β</th>
                    <th>x final</th>
                    <th>y final</th>
                    <th>z final</th>
                    <th>Tiempo</th>
                    <th>Puntos</th>
                </tr>
            </thead>
            <tbody>
    `;

    historial.forEach(r => {
        html += `
            <tr>
                <td>${r.fecha}</td>
                <td>${r.sigma}</td>
                <td>${r.rho}</td>
                <td>${r.beta}</td>
                <td>${Number(r.xFinal).toFixed(4)}</td>
                <td>${Number(r.yFinal).toFixed(4)}</td>
                <td>${Number(r.zFinal).toFixed(4)}</td>
                <td>${Number(r.tiempoFinal).toFixed(3)}</td>
                <td>${r.cantidadPuntos}</td>
            </tr>
        `;
    });

    html += "</tbody></table>";
    contenedor.innerHTML = html;
}

// Descargar historial como archivo CSV
function descargarCSV() {
    const historial = obtenerHistorial();

    if (historial.length === 0) {
        alert("No existen datos guardados para descargar.");
        return;
    }

    const columnas = [
        "fecha", "sigma", "rho", "beta",
        "x0", "y0", "z0", "dt",
        "duracionConfigurada", "tiempoFinal",
        "xFinal", "yFinal", "zFinal",
        "cantidadPuntos", "comparacion"
    ];

    const filas = [
        columnas.join(","),
        ...historial.map(r =>
            columnas.map(c =>
                `"${String(r[c] ?? "").replace(/"/g, '""')}"`
            ).join(",")
        )
    ];

    const contenido = "\uFEFF" + filas.join("\n");
    const archivo = new Blob([contenido], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "datos_simulador_lorenz.csv";
    enlace.click();

    URL.revokeObjectURL(url);
}

// Borrar historial
function borrarHistorial() {
    if (!confirm("¿Deseas borrar todos los registros guardados?")) {
        return;
    }

    localStorage.removeItem(CLAVE);
    mostrarHistorial();
}

// Eventos de los botones
$("iniciar").addEventListener("click", iniciar);

$("pausar").addEventListener("click", () => {
    detener();
    $("estado").textContent = "Estado: pausado";
});

$("reiniciar").addEventListener("click", reiniciar);

$("guardar").addEventListener("click", guardarRegistro);

$("descargar").addEventListener("click", descargarCSV);

$("borrarHistorial").addEventListener("click", borrarHistorial);

// Cambios de parámetros
[sigma, rho, beta].forEach(control => {
    control.addEventListener("input", actualizarParametros);
    control.addEventListener("change", reiniciar);
});

[x0, y0, z0, dtControl, duracionControl].forEach(control => {
    control.addEventListener("change", reiniciar);
});

$("comparar").addEventListener("change", reiniciar);

// Preparar la pantalla
actualizarParametros();
actualizarResultados();
dibujar();
mostrarHistorial();