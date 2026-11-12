import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  deleteCreditCard,
  listCreditCards
} from "../../services/creditCardsService";

import type {
  CreditCard
} from "../../types/creditCard";

import SearchBar from "./components/SearchBar";
import CreditCardTable from "./components/CreditCardTable";
import CreditCardModal from "./components/CreditCardModal";
import CardInvoices from "./components/CardInvoices";

import { usePermissions } from "../../hooks/useCompany";

import "./CreditCards.css";

function CreditCards() {
  const permissions = usePermissions("cartoes");

  const [cards, setCards] =
    useState<CreditCard[]>([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [isModalOpen, setIsModalOpen] =
    useState(false);

  const [selectedCard, setSelectedCard] =
    useState<CreditCard | null>(null);

  // Cartão cujas faturas aparecem embaixo (o primeiro, se nenhum escolhido)
  const [invoiceCardId, setInvoiceCardId] =
    useState("");

  async function loadCards() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data =
        await listCreditCards();

      setCards(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os cartões.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  const filteredCards = useMemo(() => {
    const normalizedSearch =
      searchTerm
        .trim()
        .toLowerCase();

    if (!normalizedSearch) {
      return cards;
    }

    return cards.filter(card => {
      const fields = [
        card.name,
        card.bank_accounts?.name,
        card.bank_accounts?.bank,
        card.brand,
        card.final_digits,
        card.holder_name
      ];

      return fields.some(field =>
        String(field ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [cards, searchTerm]);

  function handleNewCard() {
    setSelectedCard(null);
    setIsModalOpen(true);
  }

  function handleEditCard(
    card: CreditCard
  ) {
    setSelectedCard(card);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setSelectedCard(null);
  }

  async function handleDeleteCard(
    card: CreditCard
  ) {
    const confirmed =
      window.confirm(
        `Deseja realmente excluir o cartão "${card.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      await deleteCreditCard(card.id);
      await loadCards();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o cartão.";

      window.alert(message);
    }
  }

  async function handleCardSaved() {
    await loadCards();
    handleCloseModal();
  }

  return (
    <div className="credit-cards-page">
      <section className="credit-cards-header">
        <div>
          <h2>Cartões de Crédito</h2>

          <p>
            Cartões, limites, compras parceladas e extrato detalhado das faturas.
          </p>
        </div>

        {permissions.canCreate && (
<button
          type="button"
          className="credit-cards-new-button"
          onClick={handleNewCard}
        >
          Novo cartão
        </button>
)}
      </section>

      <section className="credit-cards-content">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
        />

        {loading && (
          <div className="credit-cards-state">
            Carregando cartões...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="credit-cards-state credit-cards-state-error">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <CreditCardTable
            cards={filteredCards}
            onEdit={permissions.canUpdate ? handleEditCard : undefined}
            onDelete={permissions.canDelete ? handleDeleteCard : undefined}
          />
        )}
      </section>

      {!loading && cards.length > 0 && (() => {
        const invoiceCard = cards.find(card => card.id === invoiceCardId) ?? cards[0];

        return (
          <section className="card-invoices-area">
            <div className="card-invoices-picker" role="tablist" aria-label="Extrato detalhado do cartão">
              <span>Extrato detalhado:</span>
              {cards.map(card => (
                <button
                  key={card.id}
                  type="button"
                  role="tab"
                  aria-selected={card.id === invoiceCard.id}
                  className={card.id === invoiceCard.id ? "is-active" : ""}
                  onClick={() => setInvoiceCardId(card.id)}
                >
                  {card.name}
                </button>
              ))}
            </div>

            <CardInvoices
              key={invoiceCard.id}
              card={invoiceCard}
              canCreate={permissions.canCreate}
              canDelete={permissions.canDelete}
              canSettle={permissions.canSettle}
              onChanged={loadCards}
            />
          </section>
        );
      })()}

      <CreditCardModal
        open={isModalOpen}
        card={selectedCard}
        onClose={handleCloseModal}
        onSaved={handleCardSaved}
      />
    </div>
  );
}

export default CreditCards;