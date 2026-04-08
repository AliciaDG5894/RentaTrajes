# python.exe -m venv .venv
# cd .venv/Scripts
# activate.bat
# py -m ensurepip --upgrade
# pip install -r requirements.txt

import os
from functools import wraps
from flask import Flask, render_template, request, jsonify, make_response, session

from flask_cors import CORS

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
import pusher
import pytz
import datetime

app            = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "Test12345")
CORS(app)

con_pool = ThreadedConnectionPool(
    1, 5,
    host=os.environ.get("DB_HOST"),
    database=os.environ.get("DB_NAME", "postgres"),
    user=os.environ.get("DB_USER", "postgres"),
    password=os.environ.get("DB_PASSWORD"),
    port=os.environ.get("DB_PORT", "5432"),
    sslmode="require"
)

PUSHER_APP_ID  = os.environ.get("PUSHER_APP_ID")
PUSHER_KEY     = os.environ.get("PUSHER_KEY")
PUSHER_SECRET  = os.environ.get("PUSHER_SECRET")
PUSHER_CLUSTER = os.environ.get("PUSHER_CLUSTER", "us2")
PUSHER_MSG     = "Hola Mundo!"

def pusherRentas():
    pusher_client = pusher.Pusher(
        app_id=PUSHER_APP_ID,
        key=PUSHER_KEY,
        secret=PUSHER_SECRET,
        cluster=PUSHER_CLUSTER,
        ssl=True
    )
    pusher_client.trigger("canalRentas", "eventoRentas", {"message": PUSHER_MSG})
    return make_response(jsonify({}))

def pusherClientes():
    pusher_client = pusher.Pusher(
        app_id=PUSHER_APP_ID,
        key=PUSHER_KEY,
        secret=PUSHER_SECRET,
        cluster=PUSHER_CLUSTER,
        ssl=True
    )
    pusher_client.trigger("canalClientes", "eventoClientes", {"message": PUSHER_MSG})
    return make_response(jsonify({}))

def pusherProductos():
    pusher_client = pusher.Pusher(
        app_id=PUSHER_APP_ID,
        key=PUSHER_KEY,
        secret=PUSHER_SECRET,
        cluster=PUSHER_CLUSTER,
        ssl=True
    )
    pusher_client.trigger("canalTrajes", "eventoTrajes", {"message": PUSHER_MSG})


def login(fun):
    @wraps(fun)
    def decorador(*args, **kwargs):
        if not session.get("login"):
            return jsonify({
                "estado": "error",
                "respuesta": "No has iniciado sesion"
            }), 401
        return fun(*args, **kwargs)
    return decorador

@app.route("/")
def landingPage():
    return render_template("landing-page.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/login")
def appLogin():
    return render_template("login.html")

@app.route("/fechaHora")
def fechaHora():
    tz    = pytz.timezone("America/Matamoros")
    ahora = datetime.datetime.now(tz)
    return ahora.strftime("%Y-%m-%d %H:%M:%S")

@app.route("/iniciarSesion", methods=["POST"])
def iniciarSesion():
    usuario    = request.form["usuario"]
    contrasena = request.form["contrasena"]

    con    = con_pool.getconn()
    cursor = con.cursor(cursor_factory=RealDictCursor)
    sql    = """
    SELECT id_usuario      AS "Id_Usuario",
           nombre_usuario  AS "Nombre_Usuario",
           tipo_usuario    AS "Tipo_Usuario"
    FROM usuarios
    WHERE nombre_usuario = %s
    AND   contrasena     = %s
    """
    cursor.execute(sql, (usuario, contrasena))
    registros = [dict(r) for r in cursor.fetchall()]

    if cursor:
        cursor.close()
    con_pool.putconn(con)

    session["login"]      = False
    session["login-usr"]  = None
    session["login-tipo"] = 0
    if registros:
        usr = registros[0]
        session["login"]      = True
        session["login-usr"]  = usr["Nombre_Usuario"]
        session["login-tipo"] = usr["Tipo_Usuario"]

    return make_response(jsonify(registros))

@app.route("/cerrarSesion", methods=["POST"])
@login
def cerrarSesion():
    session["login"]      = False
    session["login-usr"]  = None
    session["login-tipo"] = 0
    return make_response(jsonify({}))

@app.route("/preferencias")
@login
def preferencias():
    return make_response(jsonify({
        "usr": session.get("login-usr"),
        "tipo": session.get("login-tipo", 2)
    }))


@app.route("/rentas")
def rentas():
    return render_template("rentas.html")

@app.route("/tbodyRentas")
def tbodyRentas():
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)

        sql = """
        SELECT rentas.idrenta         AS "idRenta",
               clientes.nombrecliente AS "nombreCliente",
               trajes.nombretraje     AS "nombreTraje",
               trajes.descripcion     AS "descripcion",
               rentas.fechahorainicio AS "fechaHoraInicio",
               rentas.fechahorafin    AS "fechaHoraFin"
        FROM rentas
        INNER JOIN clientes ON rentas.idcliente = clientes.idcliente
        INNER JOIN trajes   ON rentas.idtraje   = trajes.idtraje
        ORDER BY rentas.idrenta DESC
        LIMIT 10 OFFSET 0
        """

        cursor.execute(sql)
        registros = [dict(r) for r in cursor.fetchall()]

        return render_template("tbodyRentas.html", rentas=registros)

    except Exception as e:
        print("Error en /tbodyRentas:", e)
        return make_response(jsonify({"error": str(e)}), 500)

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)


@app.route("/rentas/buscar", methods=["GET"])
def buscarRentas():
    con = None
    cursor = None

    args     = request.args
    busqueda = args["busqueda"]
    busqueda = f"%{busqueda}%"

    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idrenta         AS "idRenta",
               idcliente       AS "idCliente",
               idtraje         AS "idTraje",
               descripcion     AS "descripcion",
               fechahorainicio AS "fechaHoraInicio",
               fechahorafin    AS "fechaHoraFin"
        FROM rentas
        WHERE CAST(idrenta AS TEXT)          LIKE %s
        OR    CAST(idcliente AS TEXT)        LIKE %s
        OR    CAST(idtraje AS TEXT)          LIKE %s
        OR    CAST(fechahorainicio AS TEXT)   LIKE %s
        OR    CAST(fechahorafin AS TEXT)     LIKE %s
        ORDER BY idrenta DESC
        LIMIT 10 OFFSET 0
        """
        cursor.execute(sql, (busqueda, busqueda, busqueda, busqueda, busqueda))
        registros = [dict(r) for r in cursor.fetchall()]

        for registro in registros:
            inicio = registro["fechaHoraInicio"]
            fin    = registro["fechaHoraFin"]
            registro["fechaInicio"] = inicio.strftime("%d/%m/%Y")
            registro["horaInicio"]  = inicio.strftime("%H:%M:%S")
            registro["fechaFin"]    = fin.strftime("%d/%m/%Y")
            registro["horaFin"]     = fin.strftime("%H:%M:%S")

    except psycopg2.ProgrammingError as error:
        print(f"Ocurrio un error de programacion en PostgreSQL: {error}")
        registros = []

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

    return make_response(jsonify(registros))

@app.route("/rentas", methods=["POST"])
def guardarRentas():
    con = None
    cursor = None
    try:
        con = con_pool.getconn()

        idRenta         = request.form.get("idRenta")
        cliente         = request.form["idCliente"]
        traje           = request.form["idTraje"]
        descripcion     = request.form["descripcion"]
        fechahorainicio = datetime.datetime.now(pytz.timezone("America/Matamoros"))
        fechahorafin    = datetime.datetime.now(pytz.timezone("America/Matamoros"))

        cursor = con.cursor()

        if idRenta:
            sql = """
            UPDATE rentas
            SET idcliente       = %s,
                idtraje         = %s,
                descripcion     = %s,
                fechahorainicio = %s,
                fechahorafin    = %s
            WHERE idrenta = %s
            """
            val = (cliente, traje, descripcion, fechahorainicio, fechahorafin, idRenta)
        else:
            sql = """
            INSERT INTO rentas (idcliente, idtraje, descripcion, fechahorainicio, fechahorafin)
                        VALUES (%s, %s, %s, %s, %s)
            """
            val = (cliente, traje, descripcion, fechahorainicio, fechahorafin)

        cursor.execute(sql, val)
        con.commit()

        pusherRentas()

        return make_response(jsonify({}))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/rentas/<int:id>")
def editarRentas(id):
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idrenta         AS "idRenta",
               idcliente       AS "idCliente",
               idtraje         AS "idTraje",
               descripcion     AS "descripcion",
               fechahorainicio AS "fechaHoraInicio",
               fechahorafin    AS "fechaHoraFin"
        FROM rentas
        WHERE idrenta = %s
        """
        cursor.execute(sql, (id,))
        registros = [dict(r) for r in cursor.fetchall()]
        return make_response(jsonify(registros))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/rentas/eliminar", methods=["POST"])
def eliminarRentas():
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor()

        idRenta = request.form.get("id")
        cursor.execute("DELETE FROM rentas WHERE idrenta = %s", (idRenta,))
        con.commit()

        pusherRentas()

        return make_response(jsonify({"status": "ok"}))

    except Exception as e:
        print("Error eliminando renta:", e)
        return make_response(jsonify({"error": str(e)}), 500)

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/clientes")
def clientes():
    return render_template("clientes.html")

@app.route("/tbodyClientes")
def tbodyClientes():
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)

        sql = """
        SELECT idcliente          AS "idCliente",
               nombrecliente      AS "nombreCliente",
               telefono           AS "telefono",
               correoelectronico  AS "correoElectronico"
        FROM clientes
        ORDER BY idcliente DESC
        LIMIT 10 OFFSET 0
        """

        cursor.execute(sql)
        registros = [dict(r) for r in cursor.fetchall()]

        return render_template("tbodyClientes.html", clientes=registros)

    except Exception as e:
        print("Error en /tbodyClientes:", e)
        return make_response(jsonify({"error": str(e)}), 500)

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)


@app.route("/clientes/buscar", methods=["GET"])
def buscarClientes():
    con = None
    cursor = None

    args     = request.args
    busqueda = args["busqueda"]
    busqueda = f"%{busqueda}%"

    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idcliente          AS "idCliente",
               nombrecliente      AS "nombreCliente",
               telefono           AS "telefono",
               correoelectronico  AS "correoElectronico"
        FROM clientes
        WHERE nombrecliente     ILIKE %s
        OR    telefono          ILIKE %s
        OR    correoelectronico ILIKE %s
        ORDER BY idcliente DESC
        LIMIT 10 OFFSET 0
        """
        cursor.execute(sql, (busqueda, busqueda, busqueda))
        registros = [dict(r) for r in cursor.fetchall()]

    except psycopg2.ProgrammingError as error:
        print(f"Ocurrio un error de programacion en PostgreSQL: {error}")
        registros = []

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

    return make_response(jsonify(registros))

@app.route("/cliente", methods=["POST"])
def guardarCliente():
    con = None
    cursor = None
    try:
        con = con_pool.getconn()

        idCliente         = request.form.get("idCliente")
        nombre            = request.form["nombreCliente"]
        telefono          = request.form["telefono"]
        correoElectronico = request.form["correoElectronico"]

        cursor = con.cursor()

        if idCliente:
            sql = """
            UPDATE clientes
            SET nombrecliente     = %s,
                telefono          = %s,
                correoelectronico = %s
            WHERE idcliente = %s
            """
            val = (nombre, telefono, correoElectronico, idCliente)
        else:
            sql = """
            INSERT INTO clientes (nombrecliente, telefono, correoelectronico)
                        VALUES   (%s, %s, %s)
            """
            val = (nombre, telefono, correoElectronico)

        cursor.execute(sql, val)
        con.commit()

        pusherClientes()

        return make_response(jsonify({}))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/cliente/<int:id>")
def editarClientes(id):
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idcliente         AS "idCliente",
               nombrecliente     AS "nombreCliente",
               telefono          AS "telefono",
               correoelectronico AS "correoElectronico"
        FROM clientes
        WHERE idcliente = %s
        """
        cursor.execute(sql, (id,))
        registros = [dict(r) for r in cursor.fetchall()]
        return make_response(jsonify(registros))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/clientes/eliminar", methods=["POST"])
def eliminarCliente():
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor()

        idCliente = request.form.get("id")
        cursor.execute("DELETE FROM clientes WHERE idcliente = %s", (idCliente,))
        con.commit()

        pusherClientes()

        return make_response(jsonify({"status": "ok"}))

    except Exception as e:
        print("Error eliminando cliente:", e)
        return make_response(jsonify({"error": str(e)}), 500)

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

# TRAJES
@app.route("/trajes")
def trajes():
    return render_template("trajes.html")

@app.route("/tbodyTrajes")
def tbodyTrajes():
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idtraje      AS "IdTraje",
               nombretraje  AS "nombreTraje",
               descripcion  AS "descripcion"
        FROM trajes
        ORDER BY idtraje DESC
        LIMIT 10 OFFSET 0
        """
        cursor.execute(sql)
        registros = [dict(r) for r in cursor.fetchall()]
        return render_template("tbodyTrajes.html", trajes=registros)

    except Exception as e:
        print("Error en /tbodyTrajes:", e)
        return make_response(jsonify({"error": str(e)}), 500)

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/trajes/guardar", methods=["POST", "GET"])
def guardarTraje():
    con = None
    cursor = None
    try:
        con = con_pool.getconn()

        if request.method == "POST":
            data        = request.get_json(silent=True) or request.form
            id_traje    = data.get("IdTraje")
            nombre      = data.get("txtNombre")
            descripcion = data.get("txtDescripcion")
        else:
            id_traje    = None
            nombre      = request.args.get("nombre")
            descripcion = request.args.get("descripcion")

        if not nombre or not descripcion:
            return jsonify({"error": "Faltan parametros"}), 400

        cursor = con.cursor()

        if id_traje:
            sql = """
            UPDATE trajes
            SET nombretraje = %s,
                descripcion = %s
            WHERE idtraje = %s
            """
            cursor.execute(sql, (nombre, descripcion, id_traje))
        else:
            sql = """
            INSERT INTO trajes (nombretraje, descripcion)
            VALUES (%s, %s)
            """
            cursor.execute(sql, (nombre, descripcion))

        con.commit()
        pusherProductos()

        return make_response(jsonify({"mensaje": "Traje guardado correctamente"}))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/trajes/eliminar", methods=["POST", "GET"])
def eliminartraje():
    con = None
    cursor = None
    try:
        con = con_pool.getconn()

        if request.method == "POST":
            IdTraje = request.form.get("id")
        else:
            IdTraje = request.args.get("id")

        cursor = con.cursor()
        cursor.execute("DELETE FROM trajes WHERE idtraje = %s", (IdTraje,))
        con.commit()

        pusherProductos()

        return make_response(jsonify({"status": "ok"}))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/trajes/<int:id>")
def editarTrajes(id):
    con = None
    cursor = None
    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idtraje     AS "IdTraje",
               nombretraje AS "nombreTraje",
               descripcion AS "descripcion"
        FROM trajes
        WHERE idtraje = %s
        """
        cursor.execute(sql, (id,))
        registros = [dict(r) for r in cursor.fetchall()]
        return make_response(jsonify(registros))

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

@app.route("/trajes/buscar", methods=["GET"])
def buscarTrajes():
    con = None
    cursor = None

    args     = request.args
    busqueda = args["busqueda"]
    busqueda = f"%{busqueda}%"

    try:
        con    = con_pool.getconn()
        cursor = con.cursor(cursor_factory=RealDictCursor)
        sql    = """
        SELECT idtraje     AS "IdTraje",
               nombretraje AS "nombreTraje",
               descripcion AS "descripcion"
        FROM trajes
        WHERE nombretraje ILIKE %s
        OR    descripcion ILIKE %s
        ORDER BY idtraje DESC
        LIMIT 10 OFFSET 0
        """
        cursor.execute(sql, (busqueda, busqueda))
        registros = [dict(r) for r in cursor.fetchall()]

    except psycopg2.ProgrammingError as error:
        print(f"Ocurrio un error de programacion en PostgreSQL: {error}")
        registros = []

    finally:
        if cursor:
            cursor.close()
        if con:
            con_pool.putconn(con)

    return make_response(jsonify(registros))
