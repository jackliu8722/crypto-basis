import { createContext, useContext } from 'react';

/**
 * 隐私模式：隐藏一切能推算资产规模的数字（金额、数量），
 * 只保留价格与百分比——那些是相对量，看不出你有多少钱。
 */
export const PrivacyContext = createContext(false);

export const usePrivacy = () => useContext(PrivacyContext);
