import React, { useEffect, useState } from "react";

const BASE_URL = "https://examenfinalbackend-production.up.railway.app";

const formatearRespuesta = (raw: string) => {
  try {
    const json = JSON.parse(raw);
    return JSON.stringify(json, null, 2); // JSON bonito
  } catch {
    return raw; // No es un JSON válido → mostrar texto normal
  }
};

// Interfaces base
interface Property {
  type: string;
  format?: string;
  nullable?: boolean;
}

interface Schema {
  type: string;
  properties: Record<string, Property>;
}

interface SwaggerData {
  paths: Record<string, any>;
  components: {
    schemas: Record<string, Schema>;
  };
}

const FormularioDinamico = () => {
  const [swagger, setSwagger] = useState<SwaggerData | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [tagSeleccionado, setTagSeleccionado] = useState<string>("");

  const [endpointsPorTag, setEndpointsPorTag] = useState<
    Record<string, string[]>
  >({});
  const [endpointSeleccionado, setEndpointSeleccionado] = useState<string>("");

  const [metodoReal, setMetodoReal] = useState<string>("");
  const [schemaActual, setSchemaActual] = useState<Schema | null>(null);
  const [parametrosPath, setParametrosPath] = useState<any[]>([]);
  const [respuesta, setRespuesta] = useState<any>(null);

  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // Cargar swagger.json
  useEffect(() => {
    fetch("/swagger.json")
      .then((r) => r.json())
      .then((data) => {
        setSwagger(data);
        procesarTags(data);
      })
      .catch((err) => console.error("Error cargando swagger:", err));
  }, []);

  // Procesar agrupación por tags
  const procesarTags = (data: SwaggerData) => {
    const mapa: Record<string, string[]> = {};

    Object.entries(data.paths).forEach(([path, methods]) => {
      const metodo = Object.keys(methods)[0];
      const info = methods[metodo];

      const tags = info.tags || ["SinTag"];

      tags.forEach((t: string) => {
        if (!mapa[t]) mapa[t] = [];
        mapa[t].push(path);
      });
    });

    setEndpointsPorTag(mapa);
    setTags(Object.keys(mapa));
  };

  // Detectar método + parametros + body cuando se selecciona un endpoint
  useEffect(() => {
    if (!swagger || !endpointSeleccionado) return;

    const endpoint = swagger.paths[endpointSeleccionado];
    if (!endpoint) return;

    const metodo = Object.keys(endpoint)[0];
    setMetodoReal(metodo);

    const datosMetodo = endpoint[metodo];

    setParametrosPath(datosMetodo.parameters || []);

    const body = datosMetodo.requestBody?.content?.["application/json"]?.schema;

    if (body?.$ref) {
      const nombreSchema = body.$ref.replace("#/components/schemas/", "");
      setSchemaActual(swagger.components.schemas[nombreSchema]);
    } else {
      setSchemaActual(null);
    }

    setFormValues({});
  }, [swagger, endpointSeleccionado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;

    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Render dinámico de inputs
  const renderCampo = (key: string, property: Property) => {
    let type = "text";

    if (property.type === "integer" || property.type === "number")
      type = "number";
    if (property.format === "date-time") type = "datetime-local";

    if (property.type === "boolean") {
      return (
        <div key={key} className="mb-2 form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id={key}
            name={key}
            onChange={handleChange}
          />
          <label className="form-check-label" htmlFor={key}>
            {key}
          </label>
        </div>
      );
    }

    return (
      <div key={key} className="mb-2">
        <label className="form-label">{key}</label>
        <input
          type={type}
          className="form-control"
          id={key}
          name={key}
          value={formValues[key] || ""}
          onChange={handleChange}
        />
      </div>
    );
  };

  const renderBodyFields = () => {
    if (!schemaActual) return null;
    return Object.keys(schemaActual.properties).map((key) =>
      renderCampo(key, schemaActual.properties[key])
    );
  };

  const renderPathFields = () => {
    return parametrosPath.map((p) => renderCampo(p.name, p.schema));
  };

  // 🚀 Ejecutar petición dinámicamente
  const ejecutar = async () => {
    try {
      let url = BASE_URL + endpointSeleccionado;

      parametrosPath.forEach((p) => {
        url = url.replace(`{${p.name}}`, formValues[p.name]);
      });

      const method = metodoReal.toUpperCase();

      let options: RequestInit = { method };

      if (method === "POST" || method === "PUT") {
        const body: any = {};
        if (schemaActual) {
          Object.keys(schemaActual.properties).forEach((key) => {
            body[key] = formValues[key];
          });
        }

        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
      }

      console.log("➡ Request:", url, method, formValues);
      const res = await fetch(url, options);
      const text = await res.text();

      setRespuesta(text);
    } catch (err) {
      console.error("❌ Error:", err);
      setRespuesta("Error en la petición");
    }
  };

  if (!swagger) return <div>Cargando Swagger…</div>;

  return (
    <div className="container mt-3">
      <h1>Formulario Dinámico según Swagger</h1>

      {/* PRIMER SELECT: TAGS */}
      <div className="mb-3">
        <label className="form-label fw-bold">Selecciona un grupo (tag)</label>
        <select
          className="form-select"
          value={tagSeleccionado}
          onChange={(e) => {
            setTagSeleccionado(e.target.value);
            setEndpointSeleccionado("");
          }}
        >
          <option value="">-- Selecciona un tag --</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* SEGUNDO SELECT: ENDPOINTS DEL TAG */}
      {tagSeleccionado && (
        <div className="mb-3">
          <label className="form-label fw-bold">Selecciona un endpoint</label>
          <select
            className="form-select"
            value={endpointSeleccionado}
            onChange={(e) => setEndpointSeleccionado(e.target.value)}
          >
            <option value="">-- Selecciona un endpoint --</option>
            {endpointsPorTag[tagSeleccionado].map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mostrar método */}
      {endpointSeleccionado && (
        <div className="alert alert-secondary">
          <strong>Método:</strong> {metodoReal.toUpperCase()}
        </div>
      )}

      {(parametrosPath.length > 0 || schemaActual) && (
        <div className="border p-3 mb-3">
          {parametrosPath.length > 0 && (
            <>
              <h5>Parámetros del PATH</h5>
              {renderPathFields()}
            </>
          )}

          {schemaActual && (
            <>
              <h5 className="mt-3">Body JSON</h5>
              {renderBodyFields()}
            </>
          )}
        </div>
      )}

      {endpointSeleccionado && (
        <button onClick={ejecutar} className="btn btn-primary mb-3">
          Ejecutar {metodoReal.toUpperCase()}
        </button>
      )}

      {respuesta && (
        <div className="alert alert-info mt-4">
          <h5>Respuesta del servidor:</h5>

          <pre
            style={{
              background: "#1e1e1e",
              color: "#dcdcdc",
              padding: "1rem",
              borderRadius: "8px",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {formatearRespuesta(respuesta)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default FormularioDinamico;
