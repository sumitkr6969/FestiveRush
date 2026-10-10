# Challenge 02 – The Festival Rush
**VoltKart Electronics**  ·  Data snapshot: morning of 2026-11-16 (stock); history up to 2026-11-15

## Files

### `inventory.csv`  (1,057 rows)

`sku`, `store`, `stock`, `ageing_days`

### `products.csv`  (151 rows)

`sku`, `product`, `brand`, `category`, `model`, `selling_price`, `launch_date`

### `promotions.csv`  (4 rows)

`sku_or_category`, `promotion`, `start_date`, `end_date`, `discount`, `expected_uplift`

### `purchase_orders.csv`  (43 rows)

`po`, `supplier`, `sku`, `qty`, `expected_date`, `status`

### `sales.csv`  (20,919 rows)

`date`, `sku`, `store`, `qty_sold`, `selling_price`

### `suppliers.csv`  (231 rows)

`supplier`, `sku`, `purchase_price`, `lead_time_days`, `moq`, `availability`

## Notes

- Six stores plus `Central WH`.
- `expected_uplift` is a fraction: 0.40 = +40% demand during the promotion.
- `sales.csv` only lists days with sales.

At hour 14 an updated version of one of these files will be released. Same columns, same format.