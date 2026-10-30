import { Link } from "react-router";
import { formatTaka } from "../format";
import type { ServiceCard } from "../types";
import { Stars } from "./small";

export default function ServiceCardView({ service }: { service: ServiceCard }) {
  return (
    <Link to={`/services/${service.id}`} className="card card-link">
      <div className="row between">
        <span className="badge badge-teal">{service.categoryName}</span>
        <Stars value={service.ratingAvg} count={service.ratingCount} />
      </div>
      <h3>{service.title}</h3>
      <p className="muted clamp">{service.description}</p>
      <div className="row between">
        <span>
          {service.providerName} · {service.area}
        </span>
        <strong>{formatTaka(service.price)}</strong>
      </div>
    </Link>
  );
}
