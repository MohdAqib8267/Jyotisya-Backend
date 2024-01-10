import { Channel, ConfirmChannel, connect, Connection } from "amqplib";
import appConfig from "../../config";

let conn: Connection, channel: Channel, confirmChannel: ConfirmChannel;
const getConnection = async () => {
  conn = await connect(appConfig.RABBITMQ_URL);
  return conn;
};

const getChannel = async (): Promise<Channel> => {
  if (!conn) {
    await getConnection();
  }
  channel = await conn.createChannel();
  return channel;
};

const getConfirmChannel = async (): Promise<ConfirmChannel> => {
  if (!conn) {
    await getConnection();
  }
  confirmChannel = await conn.createConfirmChannel();
  return confirmChannel;
};

export const pushToQueue = async (
  exchange: string,
  routingKey: string,
  message: string
) => {
  if (!channel) {
    await getChannel();
  }

  return channel.publish(exchange, routingKey, Buffer.from(message));
};
