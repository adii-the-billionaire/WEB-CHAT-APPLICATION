import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const router = express.Router();
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const user = {
      id: payload.sub,
      username: payload.name,
      email: payload.email
    };
    const jwtToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token: jwtToken, user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

export default router;
