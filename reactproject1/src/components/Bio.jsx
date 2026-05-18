import { Component, useState } from 'react'
import bioText from '../assets/Bio.txt?raw'
import bioPic from '../assets/AlstonSmithBioPic.jpg'
import './Bio.css'
import backGroundImage from '../assets/AraskaFloatsV1 - 7680x2160 - Center.png'

export default function Bio() {
    const name = "Alston Smith"

    return (
        <>
            <div className="Bio">
                <section id="Bio">
                    <section id="bioHeader">
                        <h1 className="bioTitle">{name}</h1>
                    </section>
                    <div className="bioPicture">
                        <img src={bioPic} className="bioPicture"  alt="Alston Smith Bio Pic" />
                    </div>
                    <section id="bioText">
                        <p className="bioText">{bioText}</p>
                    </section>
                </section>
            </div>
        </>
    )
}
