import "./Card.css";

type CardProps = {
  title?: string;
  children: React.ReactNode;
};

function Card({ title, children }: CardProps) {
  return (
    <section className="card">

      {title && (
        <div className="card-header">
          <h2>{title}</h2>
        </div>
      )}

      <div className="card-body">
        {children}
      </div>

    </section>
  );
}

export default Card;