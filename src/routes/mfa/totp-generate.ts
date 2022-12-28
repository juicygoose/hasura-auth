import { RequestHandler } from 'express';
import { authenticator } from 'otplib';

import { createQR, ENV, pgClient } from '@/utils';
import { sendError } from '@/errors';

export const mfatotpGenerateHandler: RequestHandler<
  {},
  { imageUrl: string; totpSecret: string },
  {}
> = async (req, res) => {
  if (!ENV.AUTH_MFA_ENABLED) {
    return sendError(res, 'disabled-endpoint');
  }
  const { userId } = req.auth as RequestAuth;

  const user = await pgClient.getUserById(userId);

  if (!user) {
    return sendError(res, 'user-not-found');
  }

  if (user.isAnonymous) {
    return sendError(res, 'forbidden-anonymous');
  }

  const totpSecret = authenticator.generateSecret(32);
  const otpAuth = authenticator.keyuri(
    userId,
    ENV.AUTH_MFA_TOTP_ISSUER,
    totpSecret
  );

  await pgClient.updateUser({
    id: userId,
    user: {
      totpSecret,
    },
  });

  const imageUrl = await createQR(otpAuth);

  return res.send({ imageUrl, totpSecret });
};
