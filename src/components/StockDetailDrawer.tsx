import type { IndicatorSnapshot, Quote, WatchlistItem } from '../types/market';
import { calculatePosition, calculateProfit, calculateYield } from '../services/indicatorCalculator';
import { formatDateTime, formatPercent, formatPrice, marketLabel } from '../utils/format';
import { Drawer } from './Drawer';
import { PositionScale } from './PositionScale';

interface StockDetailDrawerProps {
  item: WatchlistItem;
  quote?: Quote;
  indicator?: IndicatorSnapshot;
  onClose: () => void;
  onEdit: () => void;
}

function Metric({ label, value, detail, emphasized = false }: { label: string; value: string; detail?: string; emphasized?: boolean }) {
  return <div className={`metric ${emphasized ? 'metric--emphasized' : ''}`}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function StockDetailDrawer({ item, quote, indicator, onClose, onEdit }: StockDetailDrawerProps) {
  const buyPosition = calculatePosition(item.averageBuyPrice, indicator?.weekly ?? null);
  const currentYield = calculateYield(item.manualAnnualDividendPerShare, quote?.currentPrice ?? null);
  const costYield = calculateYield(item.manualAnnualDividendPerShare, item.averageBuyPrice);
  const profit = calculateProfit(quote?.currentPrice ?? null, item.averageBuyPrice);

  return (
    <Drawer
      title={item.alias || item.name}
      subtitle={`${item.name} · ${item.symbol}.${item.market} · ${marketLabel(item.market)}`}
      onClose={onClose}
      footer={<button type="button" className="button button--primary" onClick={onEdit}>编辑个人字段</button>}
    >
      <div className="detail-stack">
        <section className="detail-section">
          <div className="section-heading"><h3>最新行情</h3><span>{quote?.provider ?? '等待数据源'}</span></div>
          <div className="metrics-grid">
            <Metric label="当前价" value={`${formatPrice(quote?.currentPrice, item.priceDecimals)} ${item.currency}`} />
            <Metric label="前收" value={formatPrice(quote?.previousClose, item.priceDecimals)} />
            <Metric label="涨跌额" value={formatPrice(quote?.changeAmount, item.priceDecimals)} />
            <Metric label="涨跌幅" value={formatPercent(quote?.changePercent)} />
          </div>
          <p className="source-time">行情时间 {formatDateTime(quote?.quoteTime)} · 接收时间 {formatDateTime(quote?.receivedAt)}</p>
        </section>

        <section className="detail-section">
          <div className="section-heading"><h3>手工红利与持仓</h3><span>不含税费与汇率</span></div>
          <div className="metrics-grid">
            <Metric label="每股年红利" value={item.manualAnnualDividendPerShare ?? '--'} detail={`单位 ${item.currency}/股`} />
            <Metric label="当前价红利率" value={formatPercent(currentYield)} detail="手工红利 ÷ 当前价" emphasized />
            <Metric label="成本红利率" value={formatPercent(costYield)} detail="手工红利 ÷ 买入价" emphasized />
            <Metric label="浮动盈亏" value={formatPercent(profit)} detail="未考虑费用" />
          </div>
          <p className="source-time">红利最后维护 {formatDateTime(item.dividendUpdatedAt)}</p>
        </section>

        <section className="detail-section">
          <div className="section-heading"><h3>布林带位置</h3><span>{indicator?.intradayEstimate ? '盘中预估' : '收盘值'}</span></div>
          <PositionScale label="当前价 · 日线" position={indicator?.dailyPosition ?? null} />
          <PositionScale label="当前价 · 周线" position={indicator?.weeklyPosition ?? null} />
          <PositionScale label="买入价相对当前周轨" position={buyPosition} />
        </section>

        <section className="detail-section">
          <div className="section-heading"><h3>轨道明细</h3><span>20 周期 · 总体标准差</span></div>
          <div className="metrics-grid metrics-grid--3">
            <Metric label="日上" value={formatPrice(indicator?.daily?.upper, item.priceDecimals)} />
            <Metric label="日中" value={formatPrice(indicator?.daily?.middle, item.priceDecimals)} />
            <Metric label="日下" value={formatPrice(indicator?.daily?.lower, item.priceDecimals)} />
            <Metric label="周上" value={formatPrice(indicator?.weekly?.upper, item.priceDecimals)} />
            <Metric label="周中" value={formatPrice(indicator?.weekly?.middle, item.priceDecimals)} />
            <Metric label="周下" value={formatPrice(indicator?.weekly?.lower, item.priceDecimals)} />
            <Metric label="月中" value={formatPrice(indicator?.monthlyMiddle, item.priceDecimals)} />
          </div>
        </section>

        <section className="detail-section">
          <div className="section-heading"><h3>个人记录</h3><span>修改于 {formatDateTime(item.updatedAt)}</span></div>
          <dl className="record-list"><dt>别名</dt><dd>{item.alias || '--'}</dd><dt>备注</dt><dd>{item.note || '--'}</dd></dl>
        </section>
      </div>
    </Drawer>
  );
}
