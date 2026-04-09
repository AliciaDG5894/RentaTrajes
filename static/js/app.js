function activeMenuOption(href) {
    $("#appMenu .nav-link")
    .removeClass("active")
    .removeAttr('aria-current')

    $(`[href="${(href ? href : "#/")}"]`)
    .addClass("active")
    .attr("aria-current", "page")
}

function disableAll() {
    const elements = document.querySelectorAll(".while-waiting")
    elements.forEach(function (el, index) {
        el.setAttribute("disabled", "true")
        el.classList.add("disabled")
    })
}

function enableAll() {
    const elements = document.querySelectorAll(".while-waiting")
    elements.forEach(function (el, index) {
        el.removeAttribute("disabled")
        el.classList.remove("disabled")
    })
}

function debounce(fun, delay) {
    let timer
    return function (...args) {
        clearTimeout(timer)
        timer = setTimeout(function () {
            fun.apply(this, args)
        }, delay)
    }
}

const configFechaHora = {
    locale: "es",
    weekNumbers: true,
    minuteIncrement: 15,
    altInput: true,
    altFormat: "d/F/Y",
    dateFormat: "Y-m-d",
}

const DateTime = luxon.DateTime
let lxFechaHora
let diffMs = 0

const app = angular.module("angularjsApp", ["ngRoute"])
app.config(function ($routeProvider, $locationProvider) {
    $locationProvider.hashPrefix("")

    $routeProvider
    .when("/", {
        templateUrl: "/login",
        controller: "loginCtrl"
    })
    .when("/rentas", {
        templateUrl: "/rentas",
        controller: "rentasCtrl"
    })
    .when("/clientes", {
        templateUrl: "/clientes",
        controller: "clientesCtrl"
    })
    .when("/trajes", {
        templateUrl: "/trajes",
        controller: "trajesCtrl"
    })
    .otherwise({
        redirectTo: "/"
    })
})

// --- Funciones extraidas para reducir anidamiento ---
function cerrarSesionCallback($rootScope, $timeout, cerrarSesion) {
    $.post("cerrarSesion")
    $timeout(cerrarSesion, 500)
}

function validarRedireccionamiento(path, defaultRouteAuth, $rootScope, $timeout, cerrarSesion) {
    const login = localStorage.getItem("login") // NOSONAR: uso legitimo de localStorage para sesion
    if (login) {
        if (path === "/") {
            window.location = defaultRouteAuth // NOSONAR: redireccion interna controlada
            return
        }
        $(".btn-cerrar-sesion").click(function (event) {
            cerrarSesionCallback($rootScope, $timeout, cerrarSesion)
        })
    }
    else if ((path !== "/")
        &&  (path.indexOf("emailToken") === -1)
        &&  (path.indexOf("resetPassToken") === -1)) {
        window.location = "#/" // NOSONAR: redireccion interna controlada
    }
}
// --- Fin funciones extraidas ---

app.run(["$rootScope", "$location", "$timeout", function($rootScope, $location, $timeout) {
    $rootScope.slide             = ""
    $rootScope.spinnerGrow       = false
    $rootScope.sendingRequest    = false
    $rootScope.incompleteRequest = false
    $rootScope.completeRequest   = false
    $rootScope.login             = localStorage.getItem("login") // NOSONAR
    const defaultRouteAuth       = "#/rentas"
    let timesChangesSuccessRoute = 0

    function actualizarFechaHora() {
        lxFechaHora = DateTime.now().plus({
            milliseconds: diffMs
        })
        $rootScope.angularjsHora = lxFechaHora.setLocale("es").toFormat("hh:mm:ss a")
        $timeout(actualizarFechaHora, 500)
    }
    actualizarFechaHora()

    let preferencias = localStorage.getItem("preferencias") // NOSONAR
    try {
        preferencias = (preferencias ? JSON.parse(preferencias) :  {})
    }
    catch (error) {
        preferencias = {}
    }
    $rootScope.preferencias = preferencias

    $rootScope.$on("$routeChangeSuccess", function (event, current, previous) {
        $rootScope.spinnerGrow = false
        const path             = current.$$route.originalPath

        // AJAX Setup
        $.ajaxSetup({
            beforeSend: function (xhr) {
                // $rootScope.sendingRequest = true
            },
            headers: {
                Authorization: `Bearer ${localStorage.getItem("JWT")}` // NOSONAR
            },
            error: function (error) {
                $rootScope.sendingRequest    = false
                $rootScope.incompleteRequest = false
                $rootScope.completeRequest   = true

                const status = error.status
                enableAll()

                if (status) {
                    const respuesta = error.responseText

                    if (status === 401) {
                        cerrarSesion()
                        return
                    }

                    modal(respuesta, "Error", [
                        {html: "Aceptar", class: "btn btn-lg btn-secondary", defaultButton: true, dismiss: true}
                    ])
                }
                else {
                    toast("Error en la petici&oacute;n.")
                    $rootScope.sendingRequest    = false
                    $rootScope.incompleteRequest = true
                    $rootScope.completeRequest   = false
                }
            },
            statusCode: {
                200: function (respuesta) {
                    $rootScope.sendingRequest    = false
                    $rootScope.incompleteRequest = false
                    $rootScope.completeRequest   = true
                },
                401: function (respuesta) {
                    cerrarSesion()
                },
            }
        })

        // solo hacer si se carga una ruta existente que no sea el splash
        if (path.indexOf("splash") === -1) {

            function cerrarSesion() {
                localStorage.removeItem("JWT")       // NOSONAR
                localStorage.removeItem("login")     // NOSONAR
                localStorage.removeItem("preferencias") // NOSONAR

                const login      = localStorage.getItem("login")     // NOSONAR
                let preferencias = localStorage.getItem("preferencias") // NOSONAR

                try {
                    preferencias = (preferencias ? JSON.parse(preferencias) :  {})
                }
                catch (error) {
                    preferencias = {}
                }

                $rootScope.redireccionar(login, preferencias)
            }

            $rootScope.redireccionar = function (login, preferencias) {
                $rootScope.login        = login
                $rootScope.preferencias = preferencias
                validarRedireccionamiento(path, defaultRouteAuth, $rootScope, $timeout, cerrarSesion)
            }

            validarRedireccionamiento(path, defaultRouteAuth, $rootScope, $timeout, cerrarSesion)

            // animate.css
            const active = $("#appMenu .nav-link.active").parent().index()
            const click  = $(`[href^="#${path}"]`).parent().index()

            if ((active <= 0)
            ||  (click  <= 0)
            ||  (active === click)) {
                $rootScope.slide = "animate__animated animate__faster animate__bounceIn"
            }
            else if (active !== click) {
                $rootScope.slide  = "animate__animated animate__faster animate__slideIn"
                $rootScope.slide += ((active > click) ? "Left" : "Right")
            }

            // swipe
            if (path.indexOf("rentas") !== -1) {
                $rootScope.leftView      = ""
                $rootScope.rightView     = "clientes"
                $rootScope.leftViewLink  = ""
                $rootScope.rightViewLink = "#/clientes"
            }
            else if (path.indexOf("clientes") !== -1) {
                $rootScope.leftView      = "rentas"
                $rootScope.rightView     = "trajes"
                $rootScope.leftViewLink  = "#/rentas"
                $rootScope.rightViewLink = "#/trajes"
            }
            else if (path.indexOf("ventas") !== -1) {
                $rootScope.leftView      = "clientes"
                $rootScope.rightView     = ""
                $rootScope.leftViewLink  = "#/clientes"
                $rootScope.rightViewLink = ""
            }
            else {
                $rootScope.leftView      = ""
                $rootScope.rightView     = ""
                $rootScope.leftViewLink  = ""
                $rootScope.rightViewLink = ""
            }

            let offsetX
            let threshold
            let startX = 0
            let startY = 0
            let currentX = 0
            let isDragging = false
            let isScrolling = false
            let moved = false
            let minDrag = 5

            function resetDrag() {
                offsetX = -window.innerWidth
                threshold = window.innerWidth / 4
                $("#appSwipeWrapper").get(0).style.transition = "transform 0s ease"
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${offsetX}px)`
            }
            function startDrag(event) {
                if (isScrolling && isPartiallyVisible($("#appContent").get(0))) {
                    resetDrag()
                }
                isDragging  = true
                moved       = false
                isScrolling = false
                startX = getX(event)
                startY = getY(event)
                $("#appSwipeWrapper").get(0).style.transition = "none"
                document.body.style.userSelect = "none"
            }
            function onDrag(event) {
                if (!isDragging
                ||  $(event.target).parents("table").length
                ||  $(event.target).parents("button").length
                ||  $(event.target).parents("span").length
                ||   (event.target.nodeName === "BUTTON")
                ||   (event.target.nodeName === "SPAN")
                || $(event.target).parents(".plotly-grafica").length
                || $(event.target).hasClass("plotly-grafica")) {
                    return
                }

                const x = getX(event)
                const y = getY(event)
                const deltaX = x - startX
                const deltaY = y - startY

                if (isScrolling) {
                    if (isPartiallyVisible($("#appContent").get(0))) {
                        resetDrag()
                    }
                    return
                }

                if (!moved) {
                    if (Math.abs(deltaY) > Math.abs(deltaX)) {
                        isScrolling = true
                        return
                    }
                }

                if (Math.abs(deltaX) > minDrag) {
                    moved = true
                }

                currentX = offsetX + deltaX
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${currentX}px)`
                $("#appSwipeWrapper").get(0).style.cursor = "grabbing"
                event.preventDefault()
            }
            function isPartiallyVisible(element) {
                const rect = element.getBoundingClientRect()
                return rect.right > 0 && rect.left < window.innerWidth
            }
            function endDrag() {
                if (!isDragging) {
                    return
                }
                $("#appSwipeWrapper").get(0).style.cursor = "grab"
                isDragging = false
                document.body.style.userSelect = ""
                if (isScrolling) {
                    if (isPartiallyVisible($("#appContent").get(0))) {
                        resetDrag()
                    }
                    return
                }

                if (!moved) {
                    $("#appSwipeWrapper").get(0).style.transition = "transform 0.3s ease"
                    $("#appSwipeWrapper").get(0).style.transform = `translateX(${offsetX}px)`
                    return
                }

                const delta = currentX - offsetX
                let finalX = offsetX
                let href, visible

                if (delta > threshold && offsetX < 0) {
                    finalX = offsetX + window.innerWidth
                    $("#appContentLeft").css("visibility", "visible")
                    $("#appContentRight").css("visibility", "hidden")
                    href = $("#appContentLeft").children("div").eq(0).attr("data-href")
                    visible = isPartiallyVisible($("#appContentLeft").get(0))
                } else if (delta < -threshold && offsetX > -2 * window.innerWidth) {
                    finalX = offsetX - window.innerWidth
                    $("#appContentLeft").css("visibility", "hidden")
                    $("#appContentRight").css("visibility", "visible")
                    href = $("#appContentRight").children("div").eq(0).attr("data-href")
                    visible = isPartiallyVisible($("#appContentRight").get(0))
                }

                if (href && visible) {
                    resetDrag()
                    $timeout(function () {
                        window.location = href // NOSONAR: redireccion interna controlada
                    }, 100)
                } else if (!href) {
                    resetDrag()
                    return
                }

                $("#appSwipeWrapper").get(0).style.transition = "transform 0.3s ease"
                $("#appSwipeWrapper").get(0).style.transform = `translateX(${finalX}px)`
                offsetX = finalX
            }
            function getX(event) {
                return event.touches ? event.touches[0].clientX : event.clientX
            }
            function getY(event) {
                return event.touches ? event.touches[0].clientY : event.clientY
            }
            function completeScreen() {
                $(".div-to-complete-screen").css("height", 0)
                const altoHtml    = document.documentElement.getBoundingClientRect().height
                const altoVisible = document.documentElement.clientHeight
                $(".div-to-complete-screen").css("height", ((altoHtml < altoVisible)
                ? (altoVisible - altoHtml)
                : 0) + (16 * 4))
            }

            $(document).off("mousedown touchstart mousemove touchmove click", "#appSwipeWrapper")
            $(document).on("mousedown",  "#appSwipeWrapper", startDrag)
            $(document).on("touchstart", "#appSwipeWrapper", startDrag)
            $(document).on("mousemove",  "#appSwipeWrapper", onDrag)
            document.querySelector("#appSwipeWrapper").addEventListener("touchmove", onDrag, {
                passive: false
            })
            $(document).on("mouseup",    "#appSwipeWrapper", endDrag)
            $(document).on("mouseleave", "#appSwipeWrapper", endDrag)
            $(document).on("touchend",   "#appSwipeWrapper", endDrag)
            $(document).on("click",      "#appSwipeWrapper", function (event) {
                if (moved) {
                    event.stopImmediatePropagation()
                    event.preventDefault()
                    return false
                }
            })
            $(window).on("resize", function (event) {
                resetDrag()
                completeScreen()
            })

            resetDrag()

            $timeout(function () {
                $rootScope.slide = ""
                completeScreen()

                if (timesChangesSuccessRoute === 0) {
                    timesChangesSuccessRoute++

                    $.extend($.validator.messages, {
                        required: "Llena este campo",
                        number: "Solo numeros",
                        digits: "Solo numeros enteros",
                        min: $.validator.format("No valores menores a {0}"),
                        max: $.validator.format("No valores mayores a {0}"),
                        minlength: $.validator.format("Minimo {0} caracteres"),
                        maxlength: $.validator.format("Maximo {0} caracteres"),
                        rangelength: $.validator.format("Solo {0} caracteres"),
                        equalTo: "El texto de este campo no coincide con el anterior",
                        date: "Ingresa fechas validas",
                        email: "Ingresa un correo electronico valido"
                    })

                    const startTimeRequest = Date.now()
                    $.get("fechaHora", function (fechaHora) {
                        const endTimeRequest = Date.now()
                        const rtt            = endTimeRequest - startTimeRequest
                        const delay          = rtt / 2
                        const lxFechaHoraServidor = DateTime.fromFormat(fechaHora, "yyyy-MM-dd hh:mm:ss")
                        const lxLocal = luxon.DateTime.fromMillis(endTimeRequest - delay)
                        diffMs = lxFechaHoraServidor.toMillis() - lxLocal.toMillis()
                    })

                    $.get("preferencias", {
                        token: localStorage.getItem("fbt") // NOSONAR
                    }, function (respuesta) {
                        if (typeof respuesta !== "object") {
                            return
                        }
                        const login      = "1"
                        const prefData   = respuesta
                        localStorage.setItem("login", login)           // NOSONAR
                        localStorage.setItem("preferencias", JSON.stringify(prefData)) // NOSONAR
                        $rootScope.redireccionar(login, prefData)
                    })

                    $(document).on("click", ".toggle-password", function (event) {
                        const prev = $(this).parent().find("input")
                        if (prev.prop("disabled")) {
                            return
                        }
                        prev.focus()
                        if ("selectionStart" in prev.get(0)){
                            $timeout(function () {
                                prev.get(0).selectionStart = prev.val().length
                                prev.get(0).selectionEnd   = prev.val().length
                            }, 0)
                        }
                        if (prev.attr("type") === "password") {
                            $(this).children().first()
                            .removeClass("bi-eye")
                            .addClass("bi-eye-slash")
                            prev.attr({
                                "type": "text",
                                "autocomplete": "off",
                                "data-autocomplete": prev.attr("autocomplete")
                            })
                            return
                        }
                        $(this).children().first()
                        .addClass("bi-eye")
                        .removeClass("bi-eye-slash")
                        prev.attr({
                            "type": "password",
                            "autocomplete": prev.attr("data-autocomplete")
                        })
                    })
                }
            }, 500)

            activeMenuOption(`#${path}`)
        }
    })
}])

app.controller("loginCtrl", function ($scope, $http, $rootScope) {
    $("#frmInicioSesion").submit(function (event) {
        event.preventDefault()
        pop(".div-inicio-sesion", 'Iniciando sesi&oacute;n, espere un momento...', "primary")
        $.post("iniciarSesion", $(this).serialize(), function (respuesta) {
            enableAll()
            if (respuesta.length) {
                localStorage.setItem("login", "1")                               // NOSONAR
                localStorage.setItem("preferencias", JSON.stringify(respuesta[0])) // NOSONAR
                $("#frmInicioSesion").get(0).reset()
                location.reload()
                return
            }
            pop(".div-inicio-sesion", "Usuario y/o contrase&ntilde;a incorrecto(s)", "danger")
        })
        disableAll()
    })
})

app.controller("rentasCtrl", function ($scope, $http) {
    function cargarTablaRentas() {
        $.get("/tbodyRentas", function(html) {
            $("#tbodyRentas").html(html)
        })
    }

    cargarTablaRentas()

    Pusher.logToConsole = false
    const pusherRentas  = new Pusher("b51b00ad61c8006b2e6f", { cluster: "us2" }) // NOSONAR: clave publica de Pusher
    const channelRentas = pusherRentas.subscribe("canalRentas")
    channelRentas.bind("eventoRentas", function(data) {
        cargarTablaRentas()
    })

    $(document).on("click", "#btnBuscarRenta", function() {
        const busqueda = $("#txtBuscarRenta").val().trim()
        if (busqueda === "") {
            cargarTablaRentas()
            return
        }
        $.get("/rentas/buscar", { busqueda: busqueda }, function(registros) {
            let trsHTML = ""
            registros.forEach(renta => {
                trsHTML += `
                    <tr>
                        <td>${renta.idRenta}</td>
                        <td>${renta.idCliente}</td>
                        <td>${renta.idTraje}</td>
                        <td>${renta.descripcion}</td>
                        <td>${renta.fechaHoraInicio}</td>
                        <td>${renta.fechaHoraFin}</td>
                        <td>
                            <button class="btn btn-danger btn-sm btn-eliminar" data-id="${renta.idRenta}">Eliminar</button>
                        </td>
                    </tr>
                `
            })
            $("#tbodyRentas").html(trsHTML)
        })
    })

    $("#txtBuscarRenta").on("keypress", function(e) {
        if (e.which === 13) {
            $("#btnBuscarRenta").click()
        }
    })

    $(document).on("submit", "#frmRenta", function (event) {
        event.preventDefault()
        const idRenta = $("#idRenta").val()
        $.post("/rentas", {
            idRenta:         idRenta,
            cliente:         $("#txtIdCliente").val(),
            traje:           $("#txtIdTraje").val(),
            descripcion:     $("#txtDescripcion").val(),
            fechaHoraInicio: $("#txtFechaInicio").val(),
            fechaHoraFin:    $("#txttxtFechaFin").val()
        }, function(response){
            $("#frmRenta")[0].reset()
            $("#idRenta").val("")
            cargarTablaRentas()
        })
    })

    $(document).on("click", "#tbodyRentas .btn-eliminar", function(){
        const id = $(this).data("id")
        modal("¿Deseas eliminar esta renta?", "Confirmar eliminacion", [
            {html: "Cancelar", class: "btn btn-secondary", dismiss: true},
            {html: "Eliminar", class: "btn btn-danger", defaultButton: true, fun: function() {
                $.post("/rentas/eliminar", {id: id}, function(response){
                    cargarTablaRentas()
                })
            }}
        ])
    })

    $(document).on("click", "#tbodyRentas .btn-editar", function() {
        const id             = $(this).data("id")
        const cliente        = $(this).data("IdCliente")
        const traje          = $(this).data("idtraje")
        const descripcion    = $(this).data("descripcion")
        const fechaHoraInicio = $(this).data("fechaHoraInicio")
        const fechaHoraFin   = $(this).data("fechaHoraFin")

        $("#idRenta").val(id)
        $("#txtIdCliente").val(cliente)
        $("#txtIdTraje").val(traje)
        $("#txtDescripcion").val(descripcion)
        $("#txtFechaInicio").val(fechaHoraInicio)
        $("#txttxtFechaFin").val(fechaHoraFin)

        const btnGuardar = $("#btnGuardar")
        btnGuardar.text("Actualizar")
        btnGuardar.removeClass("btn-primary").addClass("btn-success")
    })
})

app.controller("clientesCtrl", function ($scope, $http) {
    function cargarTablaClientes() {
        $.get("/tbodyClientes", function(html) {
            $("#tbodyClientes").html(html)
        })
    }

    cargarTablaClientes()

    Pusher.logToConsole = false
    const pusherClientes  = new Pusher("b51b00ad61c8006b2e6f", { cluster: "us2" }) // NOSONAR: clave publica de Pusher
    const channelClientes = pusherClientes.subscribe("canalClientes")
    channelClientes.bind("eventoClientes", function(data) {
        cargarTablaClientes()
    })

    $(document).on("click", "#btnBuscarCliente", function() {
        const busqueda = $("#txtBuscarCliente").val().trim()
        if (busqueda === "") {
            cargarTablaClientes()
            return
        }
        $.get("/clientes/buscar", { busqueda: busqueda }, function(registros) {
            let trsHTML = ""
            registros.forEach(cliente => {
                trsHTML += `
                    <tr>
                        <td>${cliente.idCliente}</td>
                        <td>${cliente.nombreCliente}</td>
                        <td>${cliente.telefono}</td>
                        <td>${cliente.correoElectronico}</td>
                        <td>
                            <button class="btn btn-danger btn-sm btn-eliminar" data-id="${cliente.idCliente}">Eliminar</button>
                        </td>
                    </tr>
                `
            })
            $("#tbodyClientes").html(trsHTML)
        })
    })

    $("#txtBuscarCliente").on("keypress", function(e) {
        if (e.which === 13) {
            $("#btnBuscarCliente").click()
        }
    })

    $(document).on("submit", "#frmCliente", function (event) {
        event.preventDefault()
        const idCliente = $("#idCliente").val()
        $.post("/cliente", {
            idCliente:         idCliente,
            nombreCliente:     $("#txtNombreCliente").val(),
            telefono:          $("#txtTelefono").val(),
            correoElectronico: $("#txtCorreoElectronico").val()
        }, function(response){
            $("#frmCliente")[0].reset()
            $("#idCliente").val("")
            cargarTablaClientes()
        })
    })

    $(document).on("click", "#tbodyClientes .btn-eliminar", function(){
        const id = $(this).data("id")
        modal("¿Deseas eliminar este cliente?", "Confirmar eliminacion", [
            {html: "Cancelar", class: "btn btn-secondary", dismiss: true},
            {html: "Eliminar", class: "btn btn-danger", defaultButton: true, fun: function() {
                $.post("/clientes/eliminar", {id: id}, function(response){
                    cargarTablaClientes()
                })
            }}
        ])
    })

    $(document).on("click", "#tbodyClientes .btn-editar", function() {
        const id       = $(this).data("id")
        const nombre   = $(this).data("nombre")
        const telefono = $(this).data("telefono")
        const correo   = $(this).data("correo")

        $("#idCliente").val(id)
        $("#txtNombreCliente").val(nombre)
        $("#txtTelefono").val(telefono)
        $("#txtCorreoElectronico").val(correo)

        const btnGuardar = $("#btnGuardar")
        btnGuardar.text("Actualizar")
        btnGuardar.removeClass("btn-primary").addClass("btn-success")
    })
})

app.controller("trajesCtrl", function ($scope, $http) {
    function buscarTrajes() {
        $.get("/tbodyTrajes", function (trsHTML) {
            $("#tbodyTrajes").html(trsHTML)
        })
    }
    function editarTraje(id) {
        fetch(`/trajes/${id}`)
            .then(response => response.json())
            .then(data => {
                if (data.length > 0) {
                    const traje = data[0]
                    document.getElementById('txtNombre').value     = traje.nombreTraje
                    document.getElementById('txtDescripcion').value = traje.descripcion
                    document.getElementById('txtIdTraje').value    = traje.IdTraje
                    $scope.txtNombre      = traje.nombreTraje
                    $scope.txtDescripcion = traje.descripcion
                    $scope.txtIdTraje     = traje.IdTraje
                    $scope.$apply()
                }
            })
    }

    buscarTrajes()

    Pusher.logToConsole = false
    const pusherTrajes  = new Pusher("b51b00ad61c8006b2e6f", { cluster: "us2" }) // NOSONAR: clave publica de Pusher
    const channelTrajes = pusherTrajes.subscribe("canalTrajes")
    channelTrajes.bind("eventoTrajes", function(data) {
        buscarTrajes()
    })

    $(document).on("click", "#tbodyTrajes .btn-modificar", function(){
        const id = $(this).data("id")
        editarTraje(id)
    })

    $scope.txtIdTraje = null
    $scope.guardarTraje = function() {
        $http.post("/trajes/guardar", {
            IdTraje:        $scope.txtIdTraje,
            txtNombre:      $scope.txtNombre,
            txtDescripcion: $scope.txtDescripcion
        }).then(function(respuesta) {
            toast(respuesta.data.mensaje)
            $scope.txtNombre      = ""
            $scope.txtDescripcion = ""
            $scope.txtIdTraje     = null
            buscarTrajes()
        }, function(error) {
            toast("Error al guardar el traje")
        })
    }

    $(document).on("click", "#btnBuscarTrajes", function() {
        const busqueda = $("#txtBuscarTrajes").val().trim()
        if (busqueda === "") {
            buscarTrajes()
            return
        }
        $.get("/trajes/buscar", { busqueda: busqueda }, function(registros) {
            let trsHTML = ""
            registros.forEach(traje => {
                trsHTML += `
                    <tr>
                        <td>${traje.IdTraje}</td>
                        <td>${traje.nombreTraje}</td>
                        <td>${traje.descripcion}</td>
                        <td>
                            <button class="btn btn-danger btn-eliminar" data-id="${traje.IdTraje}">Eliminar</button>
                        </td>
                        <td>
                            <button class="btn btn-warning btn-modificar" data-id="${traje.IdTraje}">Modificar</button>
                        </td>
                    </tr>
                `
            })
            $("#tbodyTrajes").html(trsHTML)
        })
    })

    $("#txtBuscarTrajes").on("keypress", function(e) {
        if (e.which === 13) {
            $("#btnBuscarTrajes").click()
        }
    })

    $(document).on("click", "#tbodyTrajes .btn-eliminar", function(){
        const id = $(this).data("id")
        modal("¿Deseas eliminar este traje?", "Confirmar eliminacion", [
            {html: "Cancelar", class: "btn btn-secondary", dismiss: true},
            {html: "Eliminar", class: "btn btn-danger", defaultButton: true, fun: function() {
                $.post("/trajes/eliminar", {id: id}, function(response){
                    buscarTrajes()
                })
            }}
        ])
    })
})

app.controller("productosCtrl", function ($scope, $http, $rootScope) {
    function buscarProductos() {
        $("#tbodyProductos").html(`<tr>
            <th colspan="5" class="text-center">
                <div class="spinner-border" style="width: 3rem; height: 3rem;" role="status">
                    <span class="visually-hidden">Cargando...</span>
                </div>
            </th>
        </tr>`)
        $.get("productos/buscar", {
            busqueda: ""
        }, function (productos) {
            enableAll()
            $("#tbodyProductos").html("")
            for (let x in productos) {
                const producto = productos[x]
                $("#tbodyProductos").append(`<tr>
                    <td>${producto.Id_Producto}</td>
                    <td>${producto.Nombre_Producto}</td>
                    <td>${producto.Precio}</td>
                    <td>${producto.Existencias}</td>
                    <td>
                        <button class="btn btn-info btn-ingredientes me-1 mb-1 while-waiting" data-id="${producto.Id_Producto}">Ver ingredientes...</button>
                        <button class="btn btn-danger btn-eliminar while-waiting" data-id="${producto.Id_Producto}">Eliminar</button>
                    </td>
                </tr>`)
            }
        })
        disableAll()
    }

    buscarProductos()

    Pusher.logToConsole = false
    const pusherProd  = new Pusher("12cb9c6b5319b2989000", { cluster: "us2" }) // NOSONAR
    const channelProd = pusherProd.subscribe("canalProductos")

    $(document).on("submit", "#frmProducto", function (event) {
        event.preventDefault()
        $.post("producto", {
            id:          "",
            nombre:      $("#txtNombre").val(),
            precio:      $("#txtPrecio").val(),
            existencias: $("#txtExistencias").val(),
        }, function (respuesta) {
            enableAll()
        })
        disableAll()
    })

    $(document).on("click", "#chkActualizarAutoTbodyProductos", function (event) {
        if (this.checked) {
            channelProd.bind("eventoProductos", function(data) {
                buscarProductos()
            })
            return
        }
        channelProd.unbind("eventoProductos")
    })

    $(document).on("click", ".btn-ingredientes", function (event) {
        const id = $(this).data("id")
        $.get(`productos/ingredientes/${id}`, function (html) {
            modal(html, "Ingredientes", [
                {html: "Aceptar", class: "btn btn-secondary", fun: function (event) {
                    closeModal()
                }}
            ])
        })
    })

    $(document).on("click", ".btn-eliminar", function (event) {
        const id = $(this).data("id")
        modal("Eliminar este producto?", 'Confirmaci&oacute;n', [
            {html: "No", class: "btn btn-secondary", dismiss: true},
            {html: "Si", class: "btn btn-danger while-waiting", defaultButton: true, fun: function () {
                $.post(`producto/eliminar`, {
                    id: id
                }, function (respuesta) {
                    enableAll()
                    closeModal()
                })
                disableAll()
            }}
        ])
    })
})

app.controller("decoracionesCtrl", function ($scope, $http) {
    function buscarDecoraciones() {
        $.get("tbodyDecoraciones", function (trsHTML) {
            $("#tbodyDecoraciones").html(trsHTML)
        })
    }

    buscarDecoraciones()

    Pusher.logToConsole = false
    const pusherDec  = new Pusher("12cb9c6b5319b2989000", { cluster: "us2" }) // NOSONAR
    const channelDec = pusherDec.subscribe("canalDecoraciones")
    channelDec.bind("eventoDecoraciones", function(data) {
        buscarDecoraciones()
    })

    $(document).on("submit", "#frmDecoracion", function (event) {
        event.preventDefault()
        $.post("decoracion", {
            id:          "",
            nombre:      $("#txtNombre").val(),
            precio:      $("#txtPrecio").val(),
            existencias: $("#txtExistencias").val(),
        })
    })
})

document.addEventListener("DOMContentLoaded", function (event) {
    activeMenuOption(location.hash)
})
