import { TestBed } from '@angular/core/testing';
import { PortfolioService } from './portfolio.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';
import { Asset } from '../models/asset.model';

describe('PortfolioService FIFO', () => {
  let service: PortfolioService;
  let storage: jasmine.SpyObj<StorageService>;

  const baseAsset: Asset = {
    id: 'asset-1',
    name: 'Bitcoin',
    symbol: 'BTC',
    type: 'Kripto',
    quantity: 0,
    purchasePrice: 0,
    unitPrice: 150,
    currency: 'TRY',
    trades: [],
    realizedProfit: 0,
  };

  beforeEach(() => {
    storage = jasmine.createSpyObj<StorageService>('StorageService', ['getItemSync', 'setItemSync']);
    storage.getItemSync.and.returnValue('[]');

    TestBed.configureTestingModule({
      providers: [
        PortfolioService,
        { provide: StorageService, useValue: storage },
        {
          provide: SettingsService,
          useValue: {
            settings: () => ({ currency: 'TRY', usdRate: 32, eurRate: 35 }),
          },
        },
      ],
    });

    service = TestBed.inject(PortfolioService);
  });

  it('alış lotlarını FIFO kuyruğunda tutup kalan ortalama maliyeti hesaplar', () => {
    const result = service.calculateFIFO({
      ...baseAsset,
      trades: [
        trade('buy-1', 'buy', 1, 100, '2026-01-01'),
        trade('buy-2', 'buy', 1, 200, '2026-02-01'),
      ],
    });

    expect(result.quantity).toBe(2);
    expect(result.averageCost).toBe(150);
    expect(result.realizedProfit).toBe(0);
    expect(result.unrealizedProfit).toBe(0);
  });

  it('satışta en eski alış lotundan düşüp gerçekleşmiş kârı hesaplar', () => {
    const result = service.calculateFIFO({
      ...baseAsset,
      unitPrice: 210,
      trades: [
        trade('buy-1', 'buy', 1, 100, '2026-01-01'),
        trade('buy-2', 'buy', 1, 200, '2026-02-01'),
        trade('sell-1', 'sell', 0.5, 300, '2026-03-01'),
      ],
    });

    expect(result.quantity).toBe(1.5);
    expect(result.averageCost).toBe(166.67);
    expect(result.realizedProfit).toBe(100);
    expect(result.unrealizedProfit).toBe(65);
  });

  it('addTrade sonrası asset ana quantity ve purchasePrice alanlarını günceller', () => {
    service.assets.set([{
      ...baseAsset,
      quantity: 1,
      purchasePrice: 100,
      unitPrice: 250,
      trades: [trade('legacy-asset-1', 'buy', 1, 100, '2026-01-01')],
    }]);

    const result = service.addTrade('asset-1', {
      type: 'sell',
      quantity: 0.4,
      price: 250,
      date: '2026-04-01',
    });

    const asset = service.assets()[0];
    expect(result.ok).toBeTrue();
    expect(asset.quantity).toBe(0.6);
    expect(asset.purchasePrice).toBe(100);
    expect(asset.realizedProfit).toBe(60);
    expect(storage.setItemSync).toHaveBeenCalled();
  });

  it('removeTrade sonrası FIFO değerlerini yeniden hesaplar', () => {
    service.assets.set([{
      ...baseAsset,
      quantity: 1.5,
      purchasePrice: 166.67,
      unitPrice: 210,
      trades: [
        trade('buy-1', 'buy', 1, 100, '2026-01-01'),
        trade('buy-2', 'buy', 1, 200, '2026-02-01'),
        trade('sell-1', 'sell', 0.5, 300, '2026-03-01'),
      ],
      realizedProfit: 100,
    }]);

    const result = service.removeTrade('asset-1', 'sell-1');

    const asset = service.assets()[0];
    expect(result.ok).toBeTrue();
    expect(asset.quantity).toBe(2);
    expect(asset.purchasePrice).toBe(150);
    expect(asset.realizedProfit).toBe(0);
  });

  function trade(id: string, type: 'buy' | 'sell', quantity: number, price: number, date: string) {
    return {
      id,
      assetId: 'asset-1',
      assetSymbol: 'BTC',
      assetName: 'Bitcoin',
      type,
      quantity,
      price,
      date,
    };
  }
});
