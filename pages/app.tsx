import axios from "axios";
import type { NextPage } from "next";
import Head from "next/head";
import React from "react";
import { Insights } from "../components/insights";
import Table from "../components/table";
import { Insight } from "../domain/insight";
import { DividendConstancy, PriceToEarnings, ProfitConstancy5Years, ProfitConstancy10Years } from "../domain/stock/insight";
import { Stock } from "../domain/stock/stock";
import styles from "../styles/App.module.css";
import { MongoClient } from "mongodb";
import Link from "next/link";

export async function getStaticProps() {
  const uri = process.env.MONGODB_URI ?? "";
  const options: any = { useNewUrlParser: true, useUnifiedTopology: true };
  const client = await new MongoClient(uri, options).connect();
  const collection = client.db("database").collection("stocks");
  const stocks = await collection.find().toArray();

  return {
    props: {
      data: JSON.parse(JSON.stringify(stocks)),
      // once every 24 hours
      revalidate: 60 * 60 * 24,
    },
  };
}

interface MappedStock {
  name: string;
  business: string;
  price: number;
  mainHolder: string;
  totalDividendsLast5Years: string;
  insightsScore: string;
  positiveInsights: number;
}

class StockTable extends Table<MappedStock> {}
class StockInsights extends Insights<Stock> {}

const insights: Insight<Stock>[] = [new DividendConstancy(), new PriceToEarnings(), new ProfitConstancy5Years(), new ProfitConstancy10Years()];

const App: NextPage<{ data: Stock[] }> = ({ data }) => {
  const [stock, setStock] = React.useState<Stock | null>(null);

  const [mappedData, setMappedData] = React.useState<MappedStock[]>([]);

  React.useEffect(() => {
    if (data) {
      (async () => {
        const mappedData: MappedStock[] = await Promise.all(
          data.map(async (stock) => {
            const mainHolder = stock.currentState.holders.reduce(
              (acc, holder) => {
                if (acc.totalShares < holder.totalShares) {
                  return holder;
                }
                return acc;
              },
              { name: "", totalShares: 0 }
            );

            const totalDividendsLast5Years = stock.events.reduce((acc, event) => {
              return acc + event.amount;
            }, 0);

            const positiveInsights = (await Promise.all(insights.map((i) => i.verify(stock)))).filter((res) => res).length;

            const insightsScore = `${positiveInsights}/${insights.length}`;

            const mappedStock: MappedStock = {
              // remove special characters
              name: stock.name.replace(/[^\w\s]/gi, ""),
              business: stock.business,
              price: stock.currentState.price,
              mainHolder: `${mainHolder.name} (${mainHolder.totalShares}%)`,
              totalDividendsLast5Years: totalDividendsLast5Years.toFixed(4),
              insightsScore,
              positiveInsights,
            };

            return mappedStock;
          })
        );

        setMappedData(mappedData.sort((a, b) => b.positiveInsights - a.positiveInsights));
      })();
    }
  }, [data]);

  return (
    <div className={styles.container}>
      <Head>
        <title>Bovespa insights</title>
        <meta name="description" content="Bovespa insights" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.container}>
        <div className={styles.table}>
          <div className={styles.header}>
            <Link passHref href="/">
              <div className={styles.logo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/logo-opaque.svg" alt="Logo" />
                Bovespa insights
              </div>
            </Link>
          </div>
          <StockTable
            columns={[
              {
                title: "Name",
                dataIndex: "name",
              },
              {
                title: "Business",
                dataIndex: "business",
              },
              {
                title: "Price",
                dataIndex: "price",
              },
              {
                title: "Main Holder",
                dataIndex: "mainHolder",
              },
              {
                title: "Div/5yr",
                dataIndex: "totalDividendsLast5Years",
              },
              {
                title: "Score",
                dataIndex: "insightsScore",
              },
            ]}
            dataKey="name"
            data={mappedData}
            onRowClick={(stock) => {
              const _stock = data.find((s) => s.name === stock.name);
              if (_stock) setStock(_stock);
            }}
          />
        </div>
        <div className={styles.insights} data-closed={!stock}>
          <div className={styles.insightsPanel}>
            <div className={styles.insightsHeader}>
              <div
                className={styles.closeInsights}
                onClick={() => {
                  setStock(null);
                }}
              >
                X
              </div>
              <div className={styles.insightsTitle}>{stock?.name ?? ""}</div>
            </div>
            {stock && <StockInsights data={stock} insights={insights} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
