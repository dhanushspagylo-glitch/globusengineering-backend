import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import crypto from 'crypto';
import { AuthRequest } from '../../middleware/authMiddleware';

export const getPriceFixings = async (req: AuthRequest, res: Response) => {
  try {
    const queryCompanyId = (req.query.companyId || req.query.company_id) as string;
    const user = req.user;
    const effectiveCompanyId = user?.role === 'super_admin' ? (queryCompanyId || user?.company_id) : (user?.company_id || queryCompanyId);

    if (!effectiveCompanyId && user?.role !== 'super_admin') {
      return res.json({ success: true, data: [] });
    }

    const sortBy = req.query.sortBy as string;
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const priceFixings = await (prisma as any).priceFixing.findMany({
      where: effectiveCompanyId ? {
        OR: [
          { company_id: String(effectiveCompanyId) },
          { company_id: String(effectiveCompanyId).toLowerCase() },
          { company_id: String(effectiveCompanyId).toUpperCase() }
        ]
      } : {},
      orderBy: sortBy ? { [sortBy]: sortOrder } : { created_at: 'desc' },
    });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, data: priceFixings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createPriceFixing = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const user: any = (req as any).user;
    
    const userCompanyId = user?.company_id || user?.companyId;
    const incomingCompanyId = data.companyId || data.company_id;
    
    let finalCompanyId = userCompanyId;
    if (user?.role === 'super_admin' || user?.role === 'company_admin') {
        finalCompanyId = incomingCompanyId || userCompanyId;
    }
    if (!finalCompanyId && incomingCompanyId) {
        finalCompanyId = incomingCompanyId;
    }

    const customerIdStr = String(data.customerId || data.customer_id || '').trim();
    const itemIdStr = String(data.itemId || data.item_id || '').trim();
    const processIdStr = String(data.processId || data.process_id || '').trim();
    const customerName = String(data.customerName || data.customer_name || '').trim();
    const itemName = String(data.itemName || data.item_name || '').trim();
    const processName = String(data.processName || data.process_name || '').trim();
    const priceVal = parseFloat(String(data.price || '0'));

    // Check for existing rule to prevent duplicates and upsert
    const existingRule = await (prisma as any).priceFixing.findFirst({
      where: {
        AND: [
          { customer_id: customerIdStr },
          {
            OR: [
              { item_id: itemIdStr },
              { item_name: itemName }
            ]
          },
          {
            OR: [
              { process_id: processIdStr },
              { process_name: processName }
            ]
          },
          ...(finalCompanyId ? [{
            OR: [
              { company_id: String(finalCompanyId) },
              { company_id: String(finalCompanyId).toLowerCase() },
              { company_id: String(finalCompanyId).toUpperCase() }
            ]
          }] : [])
        ]
      }
    });

    if (existingRule) {
      const updated = await (prisma as any).priceFixing.update({
        where: { id: existingRule.id },
        data: {
          customer_name: customerName || existingRule.customer_name,
          item_id: itemIdStr || existingRule.item_id,
          item_name: itemName || existingRule.item_name,
          process_id: processIdStr || existingRule.process_id,
          process_name: processName || existingRule.process_name,
          price: priceVal,
        }
      });
      return res.json({ success: true, data: updated, isExisting: true });
    }

    const priceFixing = await (prisma as any).priceFixing.create({
      data: {
        id: crypto.randomUUID(),
        customer_id: customerIdStr,
        customer_name: customerName,
        item_id: itemIdStr,
        item_name: itemName,
        process_id: processIdStr,
        process_name: processName,
        price: priceVal,
        company_id: finalCompanyId ? String(finalCompanyId) : null,
      },
    });
    res.json({ success: true, data: priceFixing });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePriceFixing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const user: any = (req as any).user;

    const existing = await (prisma as any).priceFixing.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Price fixing record not found' });
    }

    if (user?.role !== 'super_admin' && user?.company_id && existing.company_id &&
        String(existing.company_id).toLowerCase() !== String(user.company_id).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify records of another company' });
    }

    const customerId = data.customerId !== undefined ? String(data.customerId) : (data.customer_id !== undefined ? String(data.customer_id) : existing.customer_id);
    const customerName = data.customerName || data.customer_name || existing.customer_name;
    const itemId = data.itemId !== undefined ? String(data.itemId) : (data.item_id !== undefined ? String(data.item_id) : existing.item_id);
    const itemName = data.itemName || data.item_name || existing.item_name;
    const processId = data.processId !== undefined ? String(data.processId) : (data.process_id !== undefined ? String(data.process_id) : existing.process_id);
    const processName = data.processName || data.process_name || existing.process_name;
    const price = data.price !== undefined ? parseFloat(String(data.price)) : existing.price;

    const priceFixing = await (prisma as any).priceFixing.update({
      where: { id },
      data: {
        customer_id: customerId,
        customer_name: customerName,
        item_id: itemId,
        item_name: itemName,
        process_id: processId,
        process_name: processName,
        price: price,
      },
    });
    res.json({ success: true, data: priceFixing });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePriceFixing = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user: any = (req as any).user;

    const existing = await (prisma as any).priceFixing.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Price fixing record not found' });
    }

    if (user?.role !== 'super_admin' && user?.company_id && existing.company_id &&
        String(existing.company_id).toLowerCase() !== String(user.company_id).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot delete records of another company' });
    }

    await (prisma as any).priceFixing.delete({ where: { id } });
    res.json({ success: true, message: 'Price Fixing deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
