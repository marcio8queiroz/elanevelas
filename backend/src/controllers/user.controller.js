import asyncHandler from '../utils/asyncHandler.js';
import userResponse from '../utils/userResponse.js';

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: userResponse(req.user) });
});

export const updateMe = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.validated.body);
  await req.user.save();
  res.json({ success: true, data: userResponse(req.user) });
});
