import { Request, Response } from "express";
// import TransactionRepository from '../../data/repositories/transaction.db';
import { init } from "@paralleldrive/cuid2";
const length = 12;
const cuid = init({ length });
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
export const addPayment = async (req: Request, res: Response) => {
  try {
    // const transaction_query = new TransactionRepository
    var random_id = cuid();
    const prefix = "RPT_";
    const payment_id = prefix.concat(random_id);
    const data = {
      payment_id: payment_id,
      transaction_id: req.body.id,
      payment_amount: req.body.amount,
      email: req.body.email,
      contact: req.body.contact,
      wati_contact: req.body.wati_contact,
      created_at: req.body.created_at,
      status: req.body.status,
      notes: req.body.notes,
      vpa: req.body.vpa,
      method: req.body.method,
      notes_email: req.body.notes_email,
      notes_phone: req.body.notes_phone,
      spacer: req.body.spacer,
      order_id: req.body.order_id,
      entity: req.body.entity,
      currency: req.body.currency,
      invoice_id: req.body.invoice_id,
      international: req.body.international,
      amount_refunded: req.body.amount_refunded,
      refund_status: req.body.refund_status,
      captured: req.body.captured,
      description: req.body.description,
      card_id: req.body.card_id,
      bank: req.body.bank,
      wallet: req.body.wallet,
      fee: req.body.fee,
      tax: req.body.tax,
      error_code: req.body.error_code,
      error_description: req.body.error_description,
      error_source: req.body.error_source,
      error_step: req.body.error_step,
      error_reason: req.body.error_reason,
      acquirer_data_rrn: req.body.acquirer_data_rrn,
      acquirer_data_upi_transaction_id:
        req.body.acquirer_data_upi_transaction_id,
      acquirer_data_auth_code: req.body.acquirer_data_auth_code,
      acquirer_data_arn: req.body.acquirer_data_arn,
      token_id: req.body.token_id,
    };
    // const transaction_data = await transaction_query.create(data)
    return res
      .status(200)
      .json({ success: true, message: "Payment added successfully" });
    // .json(transaction_data)
  } catch (err) {
    console.log(err);
    return res.status(400).json({ error: "Error in addPayment method" });
  }
};
