import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  ContainerTypes,
  ValidatedRequest,
  ValidatedRequestSchema,
} from 'express-joi-validation';

import { gqlSdk } from '@/utils/gqlSDK';
import { AUTHENTICATION } from '@config/authentication';
import { generateTicketExpiresAt } from '@/utils/ticket';
import { APPLICATION } from '@config/application';
import { emailClient } from '@/email';

type BodyType = {
  newEmail: string;
};

interface Schema extends ValidatedRequestSchema {
  [ContainerTypes.Body]: BodyType;
}

export const userEmailReset = async (
  req: ValidatedRequest<Schema>,
  res: Response
): Promise<unknown> => {
  console.log('inside user email reset handler');

  const { newEmail } = req.body;

  if (!AUTHENTICATION.VERIFY_EMAILS) {
    throw new Error('VERIFY_EMAILS set to false');
  }

  if (!APPLICATION.EMAILS_ENABLED) {
    throw new Error('SMTP settings unavailable');
  }

  if (!req.auth?.userId) {
    return res.boom.unauthorized('User must be signed in');
  }

  const { userId } = req.auth;

  const ticket = `emailReset:${uuidv4()}`;
  const ticketExpiresAt = generateTicketExpiresAt(60 * 60); // 1 hour

  // set newEmail for user
  const updatedUserResponse = await gqlSdk.updateUser({
    id: userId,
    user: {
      ticket,
      ticketExpiresAt,
      newEmail,
    },
  });

  const user = updatedUserResponse.updateUser;

  if (!user) {
    throw new Error('Unable to get user');
  }

  // send out email
  await emailClient.send({
    template: 'email-reset',
    locals: {
      ticket,
      url: APPLICATION.SERVER_URL,
      locale: user.locale,
      appUrl: APPLICATION.APP_URL,
      displayName: user.displayName,
    },
    message: {
      to: newEmail,
      headers: {
        'x-ticket': {
          prepared: true,
          value: ticket,
        },
        'x-email-template': {
          prepared: true,
          value: 'email-reset',
        },
      },
    },
  });

  return res.send('ok');
};